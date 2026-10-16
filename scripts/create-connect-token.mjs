import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
// No admin key is needed: run the generated SQL in your own Supabase dashboard.
const token = randomBytes(32).toString('hex'),
  hash = createHash('sha256').update(token).digest('hex');
const dir = resolve('work/setup');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const recovery = process.argv.includes('--recover');
const sql = `BEGIN;\n${recovery ? 'UPDATE public.myanki_devices SET revoked_at=now() WHERE revoked_at IS NULL;\nDELETE FROM public.myanki_access;\nUPDATE public.myanki_workspace SET access_saved=false;\n' : ''}INSERT INTO public.myanki_claims(token_hash,kind,expires_at) VALUES('${hash}','bootstrap',now()+interval '30 minutes');\nCOMMIT;\n`;
writeFileSync(resolve(dir, 'setup.sql'), sql, { mode: 0o600 });
writeFileSync(resolve(dir, 'connect-code.txt'), token + '\n', { mode: 0o600 });
console.log(
  'Kode dan SQL penyiapan disimpan di work/setup/. Jalankan setup.sql melalui SQL Editor proyek Supabase, lalu gunakan connect-code.txt pada aplikasi. Berlaku 30 menit setelah SQL dijalankan.',
);
if (recovery)
  console.log(
    'Recovery SQL disconnects all devices and invalidates the old saved access code. Decks and progress are preserved.',
  );
