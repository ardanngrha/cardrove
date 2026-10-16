import { createClient } from '@supabase/supabase-js';
import { createEmptyCard, fsrs } from 'ts-fsrs';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const scheduler = fsrs({ enable_fuzz: false, request_retention: 0.9 });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-myanki',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};
const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const random = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
function state(raw: any) {
  if (!raw) return createEmptyCard();
  const s = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  s.due = new Date(s.due);
  if (s.last_review) s.last_review = new Date(s.last_review);
  return s;
}
const normalized = (c: any) =>
  c ? { ...c, state: c.state ? JSON.stringify(c.state) : null, version: c.version ?? 0 } : null;
function day(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
async function result(query: any) {
  const { data, error } = await query;
  if (error) fail(error.message, ['40001', 'PT409'].includes(error.code) ? 409 : 400);
  return data;
}
async function rpc(name: string, args = {}) {
  return result(admin.rpc('myanki_' + name, args));
}
async function body(req: Request) {
  const raw = await req.text();
  if (raw.length > 2_000_000) fail('Permintaan terlalu besar.', 413);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    fail('Data JSON tidak valid.');
  }
}
async function approved(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) fail('Perangkat belum terhubung.', 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) fail('Sesi berakhir. Hubungkan perangkat lagi.', 401);
  const device = await result(
    admin
      .from('myanki_devices')
      .select('*')
      .eq('id', data.user.id)
      .is('revoked_at', null)
      .maybeSingle(),
  );
  if (!device) fail('Akses perangkat belum disetujui atau sudah dicabut.', 401);
  return device;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const parsed = new URL(req.url);
    const route = parsed.pathname.split('/myanki-api')[1] || '/';
    const method = req.method;
    if (route === '/session' && method === 'GET') {
      let device = null;
      try {
        device = await approved(req);
      } catch {}
      const workspace = await result(admin.from('myanki_workspace').select('name').single());
      const count = await admin
        .from('myanki_devices')
        .select('id', { count: 'exact', head: true })
        .is('revoked_at', null);
      return json({
        setup: count.count === 0,
        user: device ? { name: workspace.name, deviceId: device.id } : null,
      });
    }
    if (route === '/claim' && method === 'POST') {
      const input = await body(req);
      if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token))
        fail('Kode penghubung tidak valid.');
      const tokenHash = await hash(input.token);
      const claim = await result(
        admin
          .from('myanki_claims')
          .select('*')
          .eq('token_hash', tokenHash)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle(),
      );
      if (!claim) fail('Kode sudah dipakai atau kedaluwarsa.', 403);
      const email = crypto.randomUUID() + '@devices.myanki.invalid',
        password = random();
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { myanki_device: true },
      });
      if (created.error || !created.data.user) fail('Tidak dapat membuat sesi perangkat.');
      const id = created.data.user.id;
      let granted = false;
      try {
        const client = createClient(url, anon, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const signed = await client.auth.signInWithPassword({ email, password });
        if (signed.error || !signed.data.session) fail('Sesi gagal dibuat. Coba lagi.');
        await rpc('finish_claim', {
          p_hash: tokenHash,
          p_device: id,
          p_name:
            String(input.deviceName || 'Perangkat baru')
              .trim()
              .slice(0, 80) || 'Perangkat baru',
        });
        granted = true;
        if (claim.kind === 'bootstrap' && input.name)
          await admin
            .from('myanki_workspace')
            .update({ name: String(input.name).slice(0, 64) })
            .eq('singleton', true);
        return json({
          session: {
            access_token: signed.data.session.access_token,
            refresh_token: signed.data.session.refresh_token,
          },
        });
      } catch (e) {
        if (!granted) await admin.auth.admin.deleteUser(id);
        throw e;
      }
    }
    const device = await approved(req);
    if (route === '/devices' && method === 'GET')
      return json(await result(admin.from('myanki_devices').select('*').order('created_at')));
    if (route === '/pair-token' && method === 'POST') {
      const token = random(),
        expires = new Date(Date.now() + 5 * 60000).toISOString();
      await result(
        admin
          .from('myanki_claims')
          .insert({
            token_hash: await hash(token),
            kind: 'pair',
            expires_at: expires,
            issuer: device.id,
          }),
      );
      return json({ token, expires });
    }
    if (route.startsWith('/devices/') && method === 'DELETE') {
      const id = route.slice(9);
      if (id === device.id) fail('Gunakan Putuskan perangkat untuk perangkat ini.');
      await result(
        admin.from('myanki_devices').update({ revoked_at: new Date().toISOString() }).eq('id', id),
      );
      await admin.auth.admin.deleteUser(id);
      return json({ ok: true });
    }
    if (route === '/logout' && method === 'POST') {
      await result(
        admin
          .from('myanki_devices')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', device.id),
      );
      await admin.auth.admin.deleteUser(device.id);
      return json({ ok: true });
    }
    if (route === '/summary' && method === 'GET') return json(await rpc('summary'));
    if (route === '/next' && method === 'GET') {
      const data = await rpc('next', { p_deck: parsed.searchParams.get('deck') || null });
      data.card = normalized(data.card);
      if (data.card) {
        const preview = scheduler.repeat(state(data.card.state), new Date());
        data.intervals = Object.fromEntries(
          [1, 2, 3, 4].map((r) => [r, preview[r as 1 | 2 | 3 | 4].card.due.getTime() - Date.now()]),
        );
      }
      return json(data);
    }
    if (route === '/cards' && method === 'GET') {
      const data = await rpc('browse', {
        p_q: parsed.searchParams.get('q') || '',
        p_deck: parsed.searchParams.get('deck') || '',
        p_page: Math.max(0, Math.floor(Number(parsed.searchParams.get('page')) || 0)),
      });
      data.cards = data.cards.map(normalized);
      return json(data);
    }
    if (route.startsWith('/card/') && method === 'GET') {
      const row = await result(
        admin.from('myanki_card_detail').select('*').eq('id', route.slice(6)).maybeSingle(),
      );
      if (!row) fail('Kartu tidak ditemukan.', 404);
      return json(normalized(row));
    }
    if (route === '/review' && method === 'POST') {
      const input = await body(req);
      if (
        typeof input.id !== 'string' ||
        ![1, 2, 3, 4].includes(input.rating) ||
        !Number.isInteger(input.version) ||
        !/^[-a-f0-9]{36}$/.test(input.operationId || '')
      )
        fail('Jawaban tidak valid.');
      const previous = await result(
        admin
          .from('myanki_reviews')
          .select('*')
          .eq('operation_id', input.operationId)
          .maybeSingle(),
      );
      if (previous) {
        if (
          previous.card_id !== input.id ||
          previous.device_id !== device.id ||
          previous.rating !== input.rating ||
          previous.before_version !== input.version ||
          previous.undone
        )
          fail('ID jawaban sudah digunakan.', 409);
        return json({ reviewId: previous.id, duplicate: true });
      }
      const card = await result(
        admin.from('myanki_card_detail').select('*').eq('id', input.id).maybeSingle(),
      );
      if (!card) fail('Kartu tidak ditemukan.', 404);
      const workspace = await result(admin.from('myanki_workspace').select('settings').single());
      const now = new Date(),
        scheduled = scheduler.next(state(card.state), now, input.rating);
      return json(
        await rpc('commit_review', {
          p_device: device.id,
          p_card: input.id,
          p_version: input.version,
          p_operation: input.operationId,
          p_rating: input.rating,
          p_at: now.getTime(),
          p_day: day(now, workspace.settings.timezone),
          p_elapsed: Math.max(0, Math.min(Number(input.elapsed) || 0, 300000)),
          p_state: scheduled.card,
          p_log: scheduled.log,
        }),
      );
    }
    if (route === '/undo' && method === 'POST') {
      const input = await body(req);
      return json(await rpc('undo', { p_id: input.reviewId, p_empty: createEmptyCard() }));
    }
    if (route.startsWith('/notes/') && method === 'PATCH') {
      const input = await body(req);
      if (
        !Array.isArray(input.fields) ||
        !input.fields.every((x: any) => typeof x === 'string') ||
        JSON.stringify(input.fields).length > 1_000_000 ||
        !Number.isInteger(input.modified)
      )
        fail('Isi catatan tidak valid.');
      const row = await result(
        admin
          .from('myanki_notes')
          .select('*,myanki_models(data)')
          .eq('id', decodeURIComponent(route.slice(7)))
          .maybeSingle(),
      );
      if (!row) fail('Catatan tidak ditemukan.', 404);
      if (input.fields.length !== row.myanki_models.data.flds.length)
        fail('Jumlah field tidak cocok.');
      const updated = await result(
        admin
          .from('myanki_notes')
          .update({
            fields: input.fields,
            modified: Math.max(row.modified + 1, Math.floor(Date.now() / 1000)),
          })
          .eq('id', row.id)
          .eq('modified', input.modified)
          .select('id'),
      );
      if (!updated.length) fail('Catatan berubah di device lain. Buka ulang.', 409);
      return json({ ok: true });
    }
    if (route === '/settings' && method === 'PATCH') {
      const { dailyNew, goal, timezone } = await body(req);
      if (
        !Number.isInteger(dailyNew) ||
        dailyNew < 0 ||
        dailyNew > 500 ||
        !Number.isInteger(goal) ||
        goal < 1 ||
        goal > 1000 ||
        typeof timezone !== 'string'
      )
        fail('Pengaturan tidak valid.');
      try {
        day(new Date(), timezone);
      } catch {
        fail('Zona waktu tidak valid.');
      }
      await result(
        admin
          .from('myanki_workspace')
          .update({ settings: { dailyNew, goal, timezone } })
          .eq('singleton', true),
      );
      return json({ ok: true });
    }
    if (route === '/import/begin' && method === 'POST') {
      const input = await body(req);
      if (
        !/^[a-f0-9]{64}$/.test(input.hash) ||
        typeof input.name !== 'string' ||
        !Array.isArray(input.manifest) ||
        input.manifest.length > 10000
      )
        fail('Manifest import tidak valid.');
      for (const m of input.manifest)
        if (
          !/^[a-f0-9]{64}(\.[a-z0-9]{1,10})?$/.test(m.disk) ||
          !Number.isInteger(m.bytes) ||
          m.bytes < 0 ||
          m.bytes > 50_000_000
        )
          fail('Media tidak valid atau melebihi 50 MB.');
      for (const kind of input.backup
        ? ['models', 'decks', 'notes', 'cards', 'media', 'progress', 'reviews']
        : ['models', 'decks', 'notes', 'cards', 'media'])
        if (
          !Number.isInteger(input.summary?.[kind]) ||
          input.summary[kind] < 0 ||
          input.summary[kind] > 100000
        )
          fail('Jumlah data import tidak valid.');
      const summary = { ...input.summary };
      delete summary.backup;
      if (input.backup) {
        const b = input.backup,
          settings = b.settings;
        if (
          typeof b.name !== 'string' ||
          !settings ||
          !Number.isInteger(settings.dailyNew) ||
          settings.dailyNew < 0 ||
          settings.dailyNew > 500 ||
          !Number.isInteger(settings.goal) ||
          settings.goal < 1 ||
          settings.goal > 1000 ||
          typeof settings.timezone !== 'string'
        )
          fail('Pengaturan backup tidak valid.');
        try {
          day(new Date(), settings.timezone);
        } catch {
          fail('Zona waktu backup tidak valid.');
        }
        const cards = await admin.from('myanki_cards').select('id', { count: 'exact', head: true });
        if (cards.error) fail(cards.error.message);
        if (cards.count) fail('Pemulihan hanya tersedia pada instalasi tanpa kartu.', 409);
        summary.backup = { name: b.name.slice(0, 64), settings, deviceId: device.id };
      }
      const existing = await result(
        admin.from('myanki_imports').select('*').eq('file_hash', input.hash).maybeSingle(),
      );
      if (existing?.status === 'complete') return json({ duplicate: true, ...existing.summary });
      if (existing?.status === 'uploading')
        return json({
          id: existing.id,
          resume: true,
          existing: await rpc('existing_media', {
            p_disks: input.manifest.map((m: any) => m.disk),
          }),
        });
      const active = await result(
        admin.from('myanki_imports').select('id').eq('status', 'uploading').maybeSingle(),
      );
      if (active) fail('Import lain belum selesai. Lanjutkan atau batalkan dahulu.', 409);
      const stored = new Set(
        await rpc('existing_media', { p_disks: input.manifest.map((m: any) => m.disk) }),
      );
      const usage = await rpc('storage_usage');
      const expected = input.manifest.reduce(
        (n: number, m: any) => n + (stored.has(m.disk) ? 0 : m.bytes),
        0,
      );
      if (usage.bytes + expected > 900_000_000)
        fail('Batas aman media 900 MB tercapai. Bersihkan media sebelum mengimpor.', 413);
      const payload = {
        file_hash: input.hash,
        name: input.name.slice(0, 200),
        summary,
        manifest: input.manifest,
        status: 'uploading',
      };
      const row = existing
        ? await result(
            admin
              .from('myanki_imports')
              .update(payload)
              .eq('id', existing.id)
              .select('id')
              .single(),
          )
        : await result(admin.from('myanki_imports').insert(payload).select('id').single());
      return json({
        ...row,
        existing: await rpc('existing_media', { p_disks: input.manifest.map((m: any) => m.disk) }),
      });
    }
    if (route.startsWith('/import/') && route.endsWith('/chunk') && method === 'POST') {
      const id = route.split('/')[2],
        input = await body(req);
      if (
        !['models', 'decks', 'notes', 'cards', 'media', 'progress', 'reviews'].includes(
          input.kind,
        ) ||
        !Number.isInteger(input.part) ||
        input.part < 0 ||
        !Array.isArray(input.data) ||
        input.data.length > 200
      )
        fail('Bagian import tidak valid.');
      const current = await result(
        admin.from('myanki_imports').select('status,summary').eq('id', id).single(),
      );
      if (current.status !== 'uploading') fail('Import sudah ditutup.', 409);
      if (['progress', 'reviews'].includes(input.kind) && !current.summary.backup)
        fail('Bagian backup tidak diizinkan.');
      await result(
        admin
          .from(
            ['progress', 'reviews'].includes(input.kind)
              ? 'myanki_backup_chunks'
              : 'myanki_import_chunks',
          )
          .upsert({ import_id: id, kind: input.kind, part: input.part, data: input.data }),
      );
      return json({ ok: true });
    }
    if (route.startsWith('/import/') && route.endsWith('/finish') && method === 'POST')
      return json(await rpc('finalize_import', { p_id: route.split('/')[2] }));
    if (route.startsWith('/import/') && method === 'DELETE') {
      await result(
        admin
          .from('myanki_imports')
          .update({ status: 'cancelled' })
          .eq('id', route.slice(8))
          .eq('status', 'uploading'),
      );
      await result(admin.from('myanki_import_chunks').delete().eq('import_id', route.slice(8)));
      await result(admin.from('myanki_backup_chunks').delete().eq('import_id', route.slice(8)));
      return json({ ok: true });
    }
    if (route === '/imports' && method === 'GET')
      return json(
        await result(
          admin
            .from('myanki_imports')
            .select('id,name,status,created_at,summary')
            .eq('status', 'uploading'),
        ),
      );
    if (route === '/usage' && method === 'GET') return json(await rpc('storage_usage'));
    if (route === '/media/urls' && method === 'POST') {
      const { names } = await body(req);
      if (
        !Array.isArray(names) ||
        names.length > 100 ||
        !names.every((n: any) => typeof n === 'string')
      )
        fail('Daftar media tidak valid.');
      const rows = await result(admin.from('myanki_media').select('name,disk').in('name', names));
      const paths = [...new Set(rows.map((r: any) => r.disk))];
      const signed = paths.length
        ? await admin.storage.from('myanki-media').createSignedUrls(paths, 600)
        : { data: [], error: null };
      if (signed.error) fail('Media tidak dapat dibuka.');
      return json(
        Object.fromEntries(
          rows.map((r: any) => [
            r.name,
            signed.data?.find((x: any) => x.path === r.disk)?.signedUrl ?? '',
          ]),
        ),
      );
    }
    if (route === '/backup' && method === 'GET') return json(await rpc('backup'));
    if (route === '/export' && method === 'GET') {
      const workspace = await result(admin.from('myanki_workspace').select('*').single());
      const progress = [];
      for (let page = 0; ; page++) {
        const batch = await result(
          admin
            .from('myanki_progress')
            .select('*')
            .order('card_id')
            .range(page * 1000, (page + 1) * 1000 - 1),
        );
        progress.push(...batch);
        if (batch.length < 1000) break;
      }
      const reviews = [];
      for (let page = 0; ; page++) {
        const batch = await result(
          admin
            .from('myanki_reviews')
            .select('*')
            .eq('undone', false)
            .order('at')
            .range(page * 1000, (page + 1) * 1000 - 1),
        );
        reviews.push(...batch);
        if (batch.length < 1000) break;
      }
      return json({
        format: 'MyAnki',
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: workspace.settings,
        progress,
        reviews,
      });
    }
    fail('Halaman tidak ditemukan.', 404);
  } catch (error: any) {
    console.error(error.message);
    return json({ error: error.message || 'Terjadi kesalahan.' }, error.status ?? 400);
  }
});
