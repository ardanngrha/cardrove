import yauzl from 'yauzl';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const MAX_ENTRY = 256 * 1024 * 1024;
// Decode only the protobuf wire types used by Anki package metadata/configs.
export function protobuf(buffer) {
  let pos = 0;
  const fields = {};
  const varint = () => {
    let n = 0,
      shift = 0;
    for (let i = 0; i < 10; i++) {
      if (pos >= buffer.length) throw Error('Metadata terpotong.');
      const v = buffer[pos++];
      n += (v & 127) * 2 ** shift;
      if (!(v & 128)) return n;
      shift += 7;
    }
    throw Error('Metadata tidak valid.');
  };
  while (pos < buffer.length) {
    const tag = varint(),
      key = Math.floor(tag / 8),
      wire = tag % 8;
    let v;
    if (wire === 0) v = varint();
    else if (wire === 2) {
      const len = varint();
      if (len < 0 || pos + len > buffer.length) throw Error('Metadata tidak valid.');
      v = buffer.subarray(pos, pos + len);
      pos += len;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else throw Error('Metadata protobuf tidak didukung.');
    (fields[key] ??= []).push(v);
  }
  return fields;
}
const str = (v) => (Buffer.isBuffer(v) ? v.toString('utf8') : '');
function openZip(file) {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) =>
      err ? reject(err) : resolve(zip),
    ),
  );
}
function entries(zip) {
  return new Promise((resolve, reject) => {
    const list = [];
    let total = 0;
    zip.on('entry', (e) => {
      total += e.uncompressedSize;
      if (list.length >= 30000 || total > 2 * 1024 ** 3 || e.uncompressedSize > MAX_ENTRY) {
        reject(Error('Deck terlalu besar (maks. 2 GB setelah dibuka).'));
        return;
      }
      list.push(e);
      zip.readEntry();
    });
    zip.once('end', () => resolve(list));
    zip.once('error', reject);
    zip.readEntry();
  });
}
function read(zip, entry, limit = MAX_ENTRY) {
  return new Promise((resolve, reject) => {
    if (!entry || entry.uncompressedSize > limit)
      return reject(Error('Isi deck tidak valid atau terlalu besar.'));
    zip.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      let size = 0;
      const chunks = [];
      stream.on('data', (b) => {
        size += b.length;
        if (size > limit) stream.destroy(Error('Isi deck terlalu besar.'));
        else chunks.push(b);
      });
      stream.once('error', reject);
      stream.once('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

export async function parsePackage(file, dataDir) {
  const zip = await openZip(file);
  let collection;
  const token = randomUUID(),
    folder = path.join(dataDir, 'imports', token);
  await mkdir(folder, { recursive: true });
  try {
    const list = await entries(zip),
      byName = new Map(list.map((e) => [e.fileName, e]));
    const modern = byName.has('collection.anki21b');
    const dbEntry = byName.get(
      modern
        ? 'collection.anki21b'
        : byName.has('collection.anki21')
          ? 'collection.anki21'
          : 'collection.anki2',
    );
    if (!dbEntry) throw Error('File ini tidak berisi koleksi Anki. Pilih file .apkg.');
    let bytes = await read(zip, dbEntry);
    if (modern) bytes = zstdDecompressSync(bytes, { maxOutputLength: MAX_ENTRY });
    const dbFile = path.join(folder, 'collection.sqlite');
    await writeFile(dbFile, bytes);
    collection = new DatabaseSync(dbFile, { readOnly: true });
    const tables = new Set(
      collection
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((x) => x.name),
    );
    let models = {},
      decks = {};
    if (tables.has('notetypes')) {
      for (const m of collection.prepare('SELECT id,name,config FROM notetypes').all()) {
        const config = protobuf(Buffer.from(m.config));
        models[String(m.id)] = {
          name: m.name,
          type: config[1]?.[0] ?? 0,
          css: str(config[3]?.[0]),
          flds: collection
            .prepare('SELECT name,ord FROM fields WHERE ntid=? ORDER BY ord')
            .all(m.id),
          tmpls: collection
            .prepare('SELECT name,ord,config FROM templates WHERE ntid=? ORDER BY ord')
            .all(m.id)
            .map((t) => {
              const c = protobuf(Buffer.from(t.config));
              return { name: t.name, ord: t.ord, qfmt: str(c[1]?.[0]), afmt: str(c[2]?.[0]) };
            }),
        };
      }
      for (const d of collection.prepare('SELECT id,name FROM decks').all())
        decks[String(d.id)] = { name: d.name.replaceAll('\x1f', '::') };
    } else {
      const col = collection.prepare('SELECT models,decks FROM col').get();
      models = JSON.parse(col.models);
      decks = JSON.parse(col.decks);
    }
    const notes = collection
      .prepare('SELECT id,guid,mid,mod,tags,flds FROM notes')
      .all()
      .map((n) => ({ ...n, id: String(n.id), mid: String(n.mid) }));
    const cards = collection
      .prepare('SELECT id,nid,did,ord,queue FROM cards ORDER BY due,id')
      .all()
      .map((c) => ({ ...c, id: String(c.id), nid: String(c.nid), did: String(c.did) }));
    if (!cards.length) throw Error('Deck ini tidak memiliki kartu.');
    if (cards.length > 100000) throw Error('Maksimum 100.000 kartu per impor.');
    let mediaMap = {};
    if (byName.has('media')) {
      let mapBytes = await read(zip, byName.get('media'), 16 * 1024 ** 2);
      if (modern) {
        mapBytes = zstdDecompressSync(mapBytes, { maxOutputLength: 32 * 1024 ** 2 });
        const p = protobuf(mapBytes);
        for (const [i, b] of (p[1] ?? []).entries()) {
          const e = protobuf(b);
          mediaMap[String(e[255]?.[0] ?? i)] = str(e[1]?.[0]);
        }
      } else mediaMap = JSON.parse(mapBytes.toString());
    }
    const media = {};
    await mkdir(path.join(folder, 'media'), { recursive: true });
    let decodedSize = bytes.length;
    for (const [index, name] of Object.entries(mediaMap)) {
      if (typeof name !== 'string' || !byName.has(index)) throw Error('Media deck tidak lengkap.');
      let content = await read(zip, byName.get(index), 64 * 1024 ** 2);
      if (modern) content = zstdDecompressSync(content, { maxOutputLength: 64 * 1024 ** 2 });
      decodedSize += content.length;
      if (decodedSize > 2 * 1024 ** 3) throw Error('Deck terlalu besar setelah didekompresi.');
      const hash = createHash('sha256').update(content).digest('hex');
      const ext = path
        .extname(name)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '')
        .slice(0, 12);
      const disk = hash + ext;
      await writeFile(path.join(folder, 'media', disk), content);
      media[name] = disk;
    }
    const warnings = [];
    const activeModels = new Set(notes.map((n) => n.mid));
    for (const id of activeModels) {
      const m = models[id];
      if (!m) throw Error('Tipe kartu tidak ditemukan.');
      if (m.tmpls.some((t) => /<script\b/i.test(t.qfmt + t.afmt)))
        warnings.push(
          `${m.name}: JavaScript template dinonaktifkan; teks dan media tetap diimpor.`,
        );
      if (m.name.toLowerCase().includes('image occlusion'))
        throw Error('Image Occlusion belum didukung. Ekspor deck tanpa tipe ini.');
      const filters = m.tmpls
        .flatMap((t) => [...(t.qfmt + t.afmt).matchAll(/{{([^{}]+)}}/g)].map((x) => x[1]))
        .filter(
          (x) =>
            x.includes(':') &&
            !/^(furigana|kana|kanji|text|cloze|hint|type|info-Ease):/.test(x) &&
            !x.startsWith('#') &&
            !x.startsWith('/'),
        );
      if (filters.length)
        warnings.push(
          `${m.name}: filter khusus perlu diperiksa (${[...new Set(filters)].join(', ')}).`,
        );
    }
    collection.close();
    collection = null;
    await rm(dbFile);
    return { token, folder, models, decks, notes, cards, media, warnings };
  } catch (e) {
    collection?.close();
    await rm(folder, { recursive: true, force: true });
    throw e;
  } finally {
    zip.close();
  }
}

export async function commitMedia(parsed, dataDir) {
  await mkdir(path.join(dataDir, 'media'), { recursive: true });
  for (const disk of new Set(Object.values(parsed.media))) {
    await rename(path.join(parsed.folder, 'media', disk), path.join(dataDir, 'media', disk));
  }
  await rm(parsed.folder, { recursive: true, force: true });
}
