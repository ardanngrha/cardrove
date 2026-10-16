import { createClient } from '@supabase/supabase-js';
import { t } from '../preferences.svelte';
export const cloudMode = import.meta.env.VITE_BACKEND === 'supabase';
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const cloud = cloudMode ? createClient(supabaseUrl, publicKey) : null;
let bucket = '';
export const mediaBucket = () => {
  if (!bucket)
    throw Error(
      t(
        'Media storage is not ready. Reload the page.',
        'Penyimpanan media belum siap. Muat ulang halaman.',
      ),
    );
  return bucket;
};
const entryParams = new URLSearchParams(location.hash.slice(1));
export const initialSetup = entryParams.has('setup');
export const initialClaim = entryParams.get('setup') || entryParams.get('connect') || '';
if (entryParams.has('setup') || entryParams.has('connect'))
  history.replaceState(null, '', location.pathname + location.search);
export async function cloudApi(route: string, options: RequestInit = {}): Promise<any> {
  if (!cloud)
    throw Error(t('Cloud backend is not configured.', 'Backend cloud belum dikonfigurasi.'));
  let body = options.body;
  if (route === '/auth') {
    const input = JSON.parse(String(body));
    route = '/claim';
    body = JSON.stringify({
      token: input.token || input.password,
      name: input.name,
      deviceName:
        input.deviceName ||
        `${navigator.platform || 'Browser'} · ${new Date().toLocaleDateString()}`,
    });
  }
  const session = (await cloud.auth.getSession()).data.session;
  const response = await fetch(supabaseUrl + '/functions/v1/cardrove-api' + route, {
    ...options,
    body,
    signal: options.signal ?? AbortSignal.timeout(45000),
    headers: {
      'Content-Type': 'application/json',
      apikey: publicKey,
      ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (route === '/session' && response.ok && data.user?.mediaBucket) bucket = data.user.mediaBucket;
  if (!response.ok)
    throw Object.assign(
      Error(data.error || t('Request failed. Please try again.', 'Permintaan gagal. Coba lagi.')),
      { status: response.status },
    );
  if (route === '/claim') {
    const saved = await cloud.auth.setSession(data.session);
    if (saved.error) throw saved.error;
    return (await cloudApi('/session')).user;
  }
  if (route === '/logout') await cloud.auth.signOut({ scope: 'local' });
  return data;
}
export async function mediaUrls(card: any): Promise<Record<string, string>> {
  if (!cloudMode) return {};
  const names = new Set<string>();
  const text =
    card.fields.join('\n') +
    '\n' +
    card.model.css +
    '\n' +
    card.model.tmpls.map((t: any) => t.qfmt + '\n' + t.afmt).join('\n');
  for (const match of text.matchAll(
    /\[sound:([^\]]+)\]|\bsrc\s*=\s*["']([^"']+)["']|url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi,
  )) {
    let name = match[1] || match[2] || match[3];
    if (/^(https?:|data:|\/\/)/i.test(name)) continue;
    const d = document.createElement('textarea');
    d.innerHTML = name;
    name = d.value;
    try {
      name = decodeURIComponent(name);
    } catch {}
    names.add((card.model.mediaPrefix ? card.model.mediaPrefix + ':' : '') + name);
  }
  const all = [...names],
    result: Record<string, string> = {};
  for (let i = 0; i < all.length; i += 100)
    Object.assign(
      result,
      await cloudApi('/media/urls', {
        method: 'POST',
        body: JSON.stringify({ names: all.slice(i, i + 100) }),
      }),
    );
  return result;
}
