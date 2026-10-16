import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { parsePackage, commitMedia } from '../server/import.mjs';
import { openStore, importInto } from '../server/store.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  dir = path.resolve(process.env.MYANKI_DATA_DIR ?? path.join(root, 'data')),
  db = openStore(dir);
try {
  for (const file of process.argv.slice(2)) {
    const h = await new Promise((resolve, reject) => {
      const s = createHash('sha256'),
        r = createReadStream(file);
      r.on('data', (b) => s.update(b));
      r.on('end', () => resolve(s.digest('hex')));
      r.on('error', reject);
    });
    if (db.prepare('SELECT hash FROM imports WHERE hash=?').get(h)) {
      console.log(path.basename(file) + ': already imported');
      continue;
    }
    const p = await parsePackage(file, dir);
    await commitMedia(p, dir);
    console.log(path.basename(file), importInto(db, p, h, path.basename(file)));
  }
} finally {
  db.close();
}
