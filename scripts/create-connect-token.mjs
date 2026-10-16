import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const usage = 'npm run setup:cloud -- --app-url https://YOUR_APP.pages.dev [--recover]';
if (args.includes('--help')) {
  console.log(
    usage +
      '\nCreates private setup files locally. Run setup.sql in your Supabase SQL Editor, then open setup-link.txt. Does not connect to Supabase or change any account.',
  );
  process.exit(0);
}
const index = args.indexOf('--app-url');
let app;
try {
  if (index < 0) throw Error('Missing --app-url.');
  app = new URL(args[index + 1]);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname);
  if (
    (app.protocol !== 'https:' && !(local && app.protocol === 'http:')) ||
    app.username ||
    app.password ||
    app.search ||
    app.hash
  )
    throw Error(
      'Use an HTTPS app URL without credentials, query parameters or a fragment. HTTP is allowed on localhost.',
    );
  if (args.some((arg, i) => i !== index && i !== index + 1 && arg !== '--recover'))
    throw Error('Unknown argument.');
} catch (error) {
  console.error(error.message + '\n' + usage);
  process.exit(1);
}
const recovery = args.includes('--recover');
const token = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(token).digest('hex');
const dir = resolve('work/setup');
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
const sql = `BEGIN;\n${recovery ? 'UPDATE public.myanki_devices SET revoked_at=now() WHERE revoked_at IS NULL;\nDELETE FROM public.myanki_access WHERE singleton=true;\nUPDATE public.myanki_workspace SET access_saved=false WHERE singleton=true;\n' : ''}INSERT INTO public.myanki_claims(token_hash,kind,expires_at) VALUES('${hash}','bootstrap',now()+interval '30 minutes');\nCOMMIT;\n`;
app.hash = 'setup=' + token;
for (const [name, content] of Object.entries({
  'setup.sql': sql,
  'connect-code.txt': token + '\n',
  'setup-link.txt': app.href + '\n',
})) {
  const file = resolve(dir, name);
  writeFileSync(file, content, { mode: 0o600 });
  chmodSync(file, 0o600);
}
console.log(
  'Private setup files created in work/setup/.\n1. Run work/setup/setup.sql in your Supabase project SQL Editor.\n2. Open the link in work/setup/setup-link.txt on your first device.\n3. Enter your name and workspace name, then save the generated permanent access code.\nThe setup link works once and expires 30 minutes after the SQL runs. Keep these files private; do not put them in CI logs or Git.',
);
if (recovery)
  console.log(
    'Recovery SQL disconnects all devices and invalidates the old saved access code. Decks and progress are preserved.',
  );
else
  console.log(
    'For a new installation only. Existing owners should use a saved access code or create a temporary code in Settings.',
  );
