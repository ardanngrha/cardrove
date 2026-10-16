import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const project = args[args.indexOf('--project-ref') + 1];
if (!args.includes('--project-ref') || !/^[a-z]{20}$/.test(project || ''))
  throw Error(
    'Usage: node scripts/migrate-media-bucket.mjs --project-ref YOUR_PROJECT_REF [--cleanup]',
  );
const cli = process.env.SUPABASE_CLI || 'supabase';
// The authenticated CLI obtains the key for this project; keep it in memory only.
const raw = JSON.parse(
  execFileSync(cli, ['projects', 'api-keys', '--project-ref', project, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
);
const keys = Array.isArray(raw) ? raw : raw.api_keys || raw.keys;
if (!Array.isArray(keys)) throw Error('Unexpected CLI response shape');
const key = keys.find((k) => k.name === 'service_role')?.api_key;
if (!key) throw Error('CLI did not return the required server credential');
const admin = createClient(`https://${project}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const source = 'myanki-media',
  destination = 'cardrove-media';
async function list(bucket) {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list('', { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw Error('Storage listing failed: ' + error.message);
    if (data.some((x) => !x.id)) throw Error('Unexpected nested directory');
    all.push(...data);
    if (data.length < 1000) return all;
  }
}
async function verify(original, copied) {
  const target = new Map(copied.map((x) => [x.name, x]));
  const mismatched = original.filter(
    (x) =>
      !target.has(x.name) ||
      Number(target.get(x.name).metadata.size) !== Number(x.metadata.size) ||
      target.get(x.name).metadata.mimetype !== x.metadata.mimetype,
  );
  if (mismatched.length) throw Error(`${mismatched.length} objects missing or mismatched`);
  console.log(
    JSON.stringify({
      verified: original.length,
      bytes: original.reduce((n, x) => n + Number(x.metadata.size), 0),
    }),
  );
  const sample = [
    original.find((x) => x.metadata.mimetype?.startsWith('audio/')),
    original.find((x) => x.metadata.mimetype?.startsWith('image/')),
  ].filter(Boolean);
  for (const item of sample) {
    const blobs = await Promise.all(
      [source, destination].map(async (bucket) => {
        const { data, error } = await admin.storage.from(bucket).download(item.name);
        if (error) throw Error('Sample download failed');
        return Buffer.from(await data.arrayBuffer());
      }),
    );
    if (
      createHash('sha256').update(blobs[0]).digest('hex') !==
      createHash('sha256').update(blobs[1]).digest('hex')
    )
      throw Error('Sample bytes differ');
  }
  console.log(JSON.stringify({ sampleByteMatches: sample.length }));
}
const action = args.includes('--cleanup') ? 'cleanup' : 'copy';
const original = await list(source);
if (action === 'copy') {
  const existing = new Map((await list(destination)).map((x) => [x.name, x]));
  const queue = original.filter((x) => !existing.has(x.name));
  let next = 0,
    done = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < queue.length) {
        const item = queue[next++];
        const { error } = await admin.storage
          .from(source)
          .copy(item.name, item.name, { destinationBucket: destination });
        if (error) throw Error('Storage copy failed: ' + error.message);
        done++;
        if (done % 200 === 0) console.log(JSON.stringify({ copied: done, total: queue.length }));
      }
    }),
  );
  await verify(original, await list(destination));
} else if (action === 'cleanup') {
  await verify(original, await list(destination));
  const { data: workspace, error: workspaceError } = await admin
    .from('myanki_workspace')
    .select('media_bucket')
    .eq('singleton', true)
    .single();
  if (workspaceError || workspace.media_bucket !== destination)
    throw Error('Application has not switched to the destination');
  for (let i = 0; i < original.length; i += 100) {
    const { error } = await admin.storage
      .from(source)
      .remove(original.slice(i, i + 100).map((x) => x.name));
    if (error) throw Error('Old-object cleanup failed: ' + error.message);
  }
  if ((await list(source)).length) throw Error('Old bucket still contains objects');
  const { error } = await admin.storage.deleteBucket(source);
  if (error) throw Error('Old bucket deletion failed: ' + error.message);
  console.log(JSON.stringify({ removedOldBucket: true }));
} else throw Error('Unknown action');
