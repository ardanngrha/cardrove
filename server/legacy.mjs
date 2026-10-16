import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
// Read existing installations; new files, cookies and settings use Cardrove names.
export const legacyDataDir = () => process.env.MYANKI_DATA_DIR;
export const legacyHeader = (req) => req.get('x-myanki');
export function legacyCookie(headers) {
  return (headers || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('myanki='))
    ?.slice(7);
}
export function migrateLegacyDatabase(dir) {
  const old = path.join(dir, 'myanki.sqlite'),
    current = path.join(dir, 'cardrove.sqlite');
  if (!existsSync(current) && existsSync(old)) {
    for (const suffix of ['', '-wal', '-shm'])
      if (existsSync(old + suffix)) renameSync(old + suffix, current + suffix);
  }
}
