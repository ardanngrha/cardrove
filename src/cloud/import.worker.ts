/// <reference lib="webworker" />
import { ZipReader, BlobReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import initSqlJs from 'sql.js';
import { legacyBackupName, legacyBackupFormat } from './legacy';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { decompress } from 'fzstd';

const sha = async (data: Uint8Array | string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : (data as Uint8Array<ArrayBuffer>),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
function protobuf(buffer: Uint8Array) {
  let pos = 0;
  const fields: Record<number, any[]> = {};
  const integer = () => {
    let n = 0,
      shift = 0;
    for (let i = 0; i < 10; i++) {
      if (pos >= buffer.length) throw Error('Metadata terpotong.');
      const b = buffer[pos++];
      n += (b & 127) * 2 ** shift;
      if (!(b & 128)) return n;
      shift += 7;
    }
    throw Error('Metadata tidak valid.');
  };
  while (pos < buffer.length) {
    const tag = integer(),
      key = Math.floor(tag / 8),
      wire = tag % 8;
    let v;
    if (wire === 0) v = integer();
    else if (wire === 2) {
      const size = integer();
      if (pos + size > buffer.length) throw Error('Metadata tidak valid.');
      v = buffer.slice(pos, pos + size);
      pos += size;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else throw Error('Format metadata belum didukung.');
    (fields[key] ??= []).push(v);
  }
  return fields;
}
const str = (b: any) => (b ? new TextDecoder().decode(b) : '');
let pendingStart: (() => void) | null = null;
const acknowledgements = new Map<number, () => void>();
self.onmessage = async ({ data }) => {
  if (data.type === 'continue') {
    pendingStart?.();
    return;
  }
  if (data.type === 'ack') {
    acknowledgements.get(data.id)?.();
    acknowledgements.delete(data.id);
    return;
  }
  if (data.type !== 'parse') return;
  let reader: ZipReader<Blob> | undefined;
  let db: any;
  try {
    const file: File = data.file;
    if (/\.cardrove\.zip$/i.test(file.name) || legacyBackupName.test(file.name)) {
      await restore(file);
      return;
    }
    if (!/\.apkg$/i.test(file.name)) throw Error('Pilih file .apkg.');
    if (file.size > 512 * 1024 ** 2)
      throw Error(
        'Ukuran deck maksimal 512 MB; perangkat ini mungkin membutuhkan ukuran lebih kecil.',
      );
    self.postMessage({ type: 'progress', stage: 'package' });
    const fileHash = await sha(new Uint8Array(await file.arrayBuffer()));
    reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
    const entries = await reader.getEntries();
    if (
      entries.length > 30000 ||
      entries.reduce((n, e) => n + e.uncompressedSize, 0) > 2 * 1024 ** 3
    )
      throw Error('Deck terlalu besar setelah dibuka.');
    const map = new Map(entries.map((e) => [e.filename, e]));
    const modern = map.has('collection.anki21b');
    const read = async (name: string, max = 64 * 1024 ** 2) => {
      const e = map.get(name);
      if (!e || e.directory || e.uncompressedSize > max)
        throw Error('Isi paket tidak lengkap atau terlalu besar.');
      const bytes = await e.getData(new Uint8ArrayWriter(), { checkSignature: true });
      const value = modern ? decompress(bytes) : bytes;
      if (value.length > max) throw Error('Isi deck terlalu besar.');
      return value;
    };
    const dbName = modern
      ? 'collection.anki21b'
      : map.has('collection.anki21')
        ? 'collection.anki21'
        : 'collection.anki2';
    const sql = await initSqlJs({ locateFile: () => wasmUrl });
    db = new sql.Database(await read(dbName, 256 * 1024 ** 2));
    const query = (q: string, args: any[] = []) => {
      const statement = db.prepare(q);
      try {
        statement.bind(args);
        const rows = [];
        while (statement.step()) rows.push(statement.getAsObject());
        return rows;
      } finally {
        statement.free();
      }
    };
    const tables = new Set(
      query("SELECT name FROM sqlite_master WHERE type='table'").map((x: any) => x.name),
    );
    const models: Record<string, any> = {},
      decks: Record<string, any> = {};
    if (tables.has('notetypes')) {
      for (const m of query('SELECT id,name,config FROM notetypes')) {
        const config = protobuf(m.config);
        models[String(m.id)] = {
          name: m.name,
          type: config[1]?.[0] ?? 0,
          css: str(config[3]?.[0]),
          flds: query('SELECT name,ord FROM fields WHERE ntid=? ORDER BY ord', [m.id]),
          tmpls: query('SELECT name,ord,config FROM templates WHERE ntid=? ORDER BY ord', [
            m.id,
          ]).map((t) => {
            const c = protobuf(t.config);
            return { name: t.name, ord: t.ord, qfmt: str(c[1]?.[0]), afmt: str(c[2]?.[0]) };
          }),
        };
      }
      for (const d of query('SELECT id,name FROM decks'))
        decks[String(d.id)] = { name: d.name.replaceAll('\x1f', '::') };
    } else {
      const col = query('SELECT models,decks FROM col')[0];
      Object.assign(models, JSON.parse(col.models));
      Object.assign(decks, JSON.parse(col.decks));
    }
    const notes = query('SELECT id,guid,mid,mod,tags,flds FROM notes');
    const cards = query('SELECT id,nid,did,ord,queue FROM cards ORDER BY due,id');
    if (!cards.length || cards.length > 100000) throw Error('Deck harus berisi 1–100.000 kartu.');
    const warnings: string[] = [];
    for (const id of new Set(notes.map((n) => String(n.mid)))) {
      const m = models[id];
      if (!m) throw Error('Tipe kartu tidak ditemukan.');
      if (/image occlusion/i.test(m.name)) throw Error('Image Occlusion belum didukung.');
      if (m.tmpls.some((t: any) => /<script\b/i.test(t.qfmt + t.afmt)))
        warnings.push(`${m.name}: JavaScript dinonaktifkan.`);
    }
    const prefix = await sha(
      [...new Set(cards.map((c) => String(c.did)))]
        .map((id) => decks[id]?.name ?? 'Imported')
        .sort()
        .join('\n'),
    );
    const modelRows = [];
    const modelIds = new Map();
    for (const [id, m] of Object.entries(models)) {
      const model = { ...m, mediaPrefix: prefix },
        key = await sha(id + JSON.stringify(model));
      modelRows.push({ id: key, data: model });
      modelIds.set(id, key);
    }
    const deckRows = [];
    const deckIds = new Map();
    for (const id of new Set(cards.map((c) => String(c.did)))) {
      const name = decks[id]?.name ?? 'Imported',
        key = await sha(name);
      deckRows.push({ id: key, name, imported: Date.now() });
      deckIds.set(id, key);
    }
    const noteIds = new Map();
    const noteRows = [];
    for (const n of notes) {
      const id = n.guid || (await sha(String(n.id) + file.name));
      noteIds.set(String(n.id), id);
      noteRows.push({
        id,
        model_id: modelIds.get(String(n.mid)),
        fields: n.flds.split('\x1f'),
        tags: n.tags.trim(),
        modified: n.mod,
      });
    }
    const cardRows = [];
    for (const [position, c] of cards.entries()) {
      const note = noteIds.get(String(c.nid));
      if (!note) throw Error('Referensi kartu tidak valid.');
      cardRows.push({
        id: await sha(note + ':' + c.ord),
        note_id: note,
        deck_id: deckIds.get(String(c.did)),
        ord: c.ord,
        suspended: c.queue < 0,
        position,
      });
    }
    db.close();
    db = null;
    let mediaMap: Record<string, string> = {};
    if (map.has('media')) {
      const b = await read('media', 32 * 1024 ** 2);
      if (modern) {
        for (const [i, raw] of (protobuf(b)[1] ?? []).entries()) {
          const m = protobuf(raw);
          mediaMap[String(m[255]?.[0] ?? i)] = str(m[1]?.[0]);
        }
      } else mediaMap = JSON.parse(str(b));
    }
    const mediaRows = [],
      manifest = [],
      sources: Record<string, { index: string; mime: string }> = {};
    let bytes = 0;
    const mime = (name: string) =>
      ({
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        wav: 'audio/wav',
        m4a: 'audio/mp4',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        ttf: 'font/ttf',
        otf: 'font/otf',
        woff: 'font/woff',
        woff2: 'font/woff2',
      })[name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';
    let index = 0;
    for (const [entry, name] of Object.entries(mediaMap)) {
      if (index % 50 === 0)
        self.postMessage({
          type: 'progress',
          stage: 'media',
          current: index,
          total: Object.keys(mediaMap).length,
        });
      index++;
      const content = await read(entry, 50_000_000);
      bytes += content.length;
      if (bytes > 900_000_000) throw Error('Media deck melebihi batas aman 900 MB.');
      const match = name.match(/\.[^.]+$/),
        ext = (match?.[0] ?? '')
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, '')
          .slice(0, 11),
        disk = (await sha(content)) + ext,
        type = mime(name);
      mediaRows.push({ name: prefix + ':' + name, disk, bytes: content.length, mime: type });
      if (!sources[disk]) {
        sources[disk] = { index: entry, mime: type };
        manifest.push({ disk, bytes: content.length, mime: type });
      }
    }
    const rows = {
      models: modelRows,
      decks: deckRows,
      notes: noteRows,
      cards: cardRows,
      media: mediaRows,
    };
    self.postMessage({
      type: 'ready',
      hash: fileHash,
      name: file.name,
      manifest,
      rows,
      summary: {
        models: modelRows.length,
        decks: deckRows.length,
        notes: noteRows.length,
        cards: cardRows.length,
        media: mediaRows.length,
        warnings,
      },
    });
    await new Promise<void>((r) => (pendingStart = r));
    pendingStart = null;
    let id = 0;
    const active = new Set<Promise<void>>();
    for (const [disk, source] of Object.entries(sources)) {
      const content = await read(source.index, 50_000_000);
      const current = id++;
      let done: () => void;
      const acknowledged = new Promise<void>((r) => (done = r));
      acknowledgements.set(current, done!);
      active.add(acknowledged);
      acknowledged.then(() => active.delete(acknowledged));
      self.postMessage({ type: 'media', id: current, disk, mime: source.mime, bytes: content }, [
        content.buffer,
      ]);
      if (active.size >= 4) await Promise.race(active);
    }
    await Promise.all(active);
    self.postMessage({ type: 'done' });
  } catch (error) {
    self.postMessage({ type: 'error', message: (error as Error).message });
  } finally {
    db?.close();
    await reader?.close();
  }
};

async function restore(file: File) {
  const zip = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    if (file.size > 512 * 1024 ** 2) throw Error('Backup terlalu besar untuk pemulihan browser.');
    const entries = await zip.getEntries();
    const map = new Map(entries.map((e) => [e.filename, e]));
    if (entries.length > 10001 || entries.reduce((n, e) => n + e.uncompressedSize, 0) > 1024 ** 3)
      throw Error('Backup terlalu besar.');
    const read = async (name: string, max = 50_000_000) => {
      const e = map.get(name);
      if (!e || e.directory || e.uncompressedSize > max)
        throw Error('Isi backup tidak lengkap atau terlalu besar.');
      return e.getData(new Uint8ArrayWriter(), { checkSignature: true });
    };
    const saved = JSON.parse(str(await read('backup.json', 64 * 1024 ** 2)));
    if (!['CardroveBackup', legacyBackupFormat].includes(saved.format) || saved.version !== 1)
      throw Error('Format backup tidak didukung.');
    const kinds = ['models', 'decks', 'notes', 'cards', 'media', 'progress', 'reviews'];
    for (const kind of kinds)
      if (!Array.isArray(saved.rows?.[kind]) || saved.rows[kind].length > 100000)
        throw Error('Data backup tidak valid.');
    const sources: Record<string, any> = {};
    for (const m of saved.rows.media) {
      if (
        !/^[a-f0-9]{64}(\.[a-z0-9]{1,10})?$/.test(m.disk) ||
        !Number.isInteger(m.bytes) ||
        m.bytes > 50_000_000 ||
        m.bytes < 0
      )
        throw Error('Media backup tidak valid.');
      sources[m.disk] = m;
    }
    const manifest = Object.values(sources).map((m) => ({
      disk: m.disk,
      bytes: m.bytes,
      mime: m.mime,
    }));
    let index = 0;
    for (const m of manifest) {
      if (index++ % 50 === 0)
        self.postMessage({
          type: 'progress',
          stage: 'backup',
          current: index,
          total: manifest.length,
        });
      const bytes = await read('media/' + m.disk);
      if (bytes.length !== m.bytes || (await sha(bytes)) !== m.disk.split('.')[0])
        throw Error('Isi media backup rusak.');
    }
    const summary = Object.fromEntries(kinds.map((k) => [k, saved.rows[k].length]));
    self.postMessage({
      type: 'ready',
      hash: await sha(new Uint8Array(await file.arrayBuffer())),
      name: file.name,
      manifest,
      rows: saved.rows,
      summary,
      backup: saved.workspace,
    });
    await new Promise<void>((r) => (pendingStart = r));
    pendingStart = null;
    let id = 0;
    const active = new Set<Promise<void>>();
    for (const m of manifest) {
      const content = await read('media/' + m.disk);
      const current = id++;
      let done: () => void;
      const acknowledged = new Promise<void>((r) => (done = r));
      acknowledgements.set(current, done!);
      active.add(acknowledged);
      acknowledged.then(() => active.delete(acknowledged));
      self.postMessage({ type: 'media', id: current, disk: m.disk, mime: m.mime, bytes: content }, [
        content.buffer,
      ]);
      if (active.size >= 4) await Promise.race(active);
    }
    await Promise.all(active);
    self.postMessage({ type: 'done' });
  } finally {
    await zip.close();
  }
}
