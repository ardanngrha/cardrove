import { DatabaseSync } from 'node:sqlite';
import { writeFile, readFile } from 'node:fs/promises';
import { crc32, zstdCompressSync } from 'node:zlib';
import path from 'node:path';
export function zip(entries) {
  let offset = 0;
  const local = [],
    central = [];
  for (const [name, data] of entries) {
    const n = Buffer.from(name),
      b = Buffer.from(data),
      crc = crc32(b),
      h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(b.length, 18);
    h.writeUInt32LE(b.length, 22);
    h.writeUInt16LE(n.length, 26);
    local.push(h, n, b);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(b.length, 20);
    c.writeUInt32LE(b.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += h.length + n.length + b.length;
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
function variable(n) {
  const b = [];
  do {
    const v = n % 128;
    n = Math.floor(n / 128);
    b.push(v | (n ? 128 : 0));
  } while (n);
  return Buffer.from(b);
}
export function proto(fields) {
  return Buffer.concat(
    fields.map(([key, value]) =>
      typeof value === 'number'
        ? Buffer.concat([variable(key * 8), variable(value)])
        : Buffer.concat([
            variable(key * 8 + 2),
            variable(Buffer.byteLength(value)),
            Buffer.from(value),
          ]),
    ),
  );
}
export async function fixture(dir, modern = false) {
  const dbpath = path.join(dir, 'fixture-' + modern + '.sqlite'),
    db = new DatabaseSync(dbpath);
  db.exec(
    'CREATE TABLE notes(id INTEGER,guid TEXT,mid INTEGER,mod INTEGER,tags TEXT,flds TEXT);CREATE TABLE cards(id INTEGER,nid INTEGER,did INTEGER,ord INTEGER,queue INTEGER,due INTEGER);',
  );
  db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
    1,
    'guid-test-one',
    10,
    100,
    ' test ',
    '学ぶ\x1fbelajar',
  );
  db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
    2,
    'guid-test-two',
    10,
    100,
    ' test ',
    '猫\x1fkucing',
  );
  for (const c of [
    [1, 1, 20, 0, 0, 0],
    [2, 1, 20, 1, 0, 1],
    [3, 2, 20, 0, 0, 2],
  ])
    db.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?)').run(...c);
  const model = {
    name: 'Basic reversed',
    type: 0,
    css: '.card {color:black}',
    flds: [
      { name: 'Front', ord: 0 },
      { name: 'Back', ord: 1 },
    ],
    tmpls: [
      { name: 'Forward', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' },
      { name: 'Reverse', ord: 1, qfmt: '{{Back}}', afmt: '{{Front}}' },
    ],
  };
  if (modern) {
    db.exec(
      'CREATE TABLE notetypes(id INTEGER,name TEXT,config BLOB);CREATE TABLE fields(ntid INTEGER,ord INTEGER,name TEXT);CREATE TABLE templates(ntid INTEGER,ord INTEGER,name TEXT,config BLOB);CREATE TABLE decks(id INTEGER,name TEXT);',
    );
    db.prepare('INSERT INTO notetypes VALUES(?,?,?)').run(
      10,
      model.name,
      proto([
        [1, 0],
        [3, model.css],
      ]),
    );
    for (const f of model.flds)
      db.prepare('INSERT INTO fields VALUES(?,?,?)').run(10, f.ord, f.name);
    for (const t of model.tmpls)
      db.prepare('INSERT INTO templates VALUES(?,?,?,?)').run(
        10,
        t.ord,
        t.name,
        proto([
          [1, t.qfmt],
          [2, t.afmt],
        ]),
      );
    db.prepare('INSERT INTO decks VALUES(?,?)').run(20, 'Japanese\x1fTest');
  } else {
    db.exec('CREATE TABLE col(models TEXT,decks TEXT);');
    db.prepare('INSERT INTO col VALUES(?,?)').run(
      JSON.stringify({ 10: model }),
      JSON.stringify({ 20: { name: 'Japanese::Test' } }),
    );
  }
  db.close();
  const collection = await readFile(dbpath),
    media = Buffer.from('test-media'),
    mediaMap = modern
      ? proto([
          [
            1,
            proto([
              [1, 'sample.mp3'],
              [2, media.length],
            ]),
          ],
        ])
      : Buffer.from('{"0":"sample.mp3"}');
  const entries = [
    [
      modern ? 'collection.anki21b' : 'collection.anki21',
      modern ? zstdCompressSync(collection) : collection,
    ],
    ['media', modern ? zstdCompressSync(mediaMap) : mediaMap],
    ['0', modern ? zstdCompressSync(media) : media],
  ];
  const file = path.join(dir, modern ? 'modern.apkg' : 'legacy.apkg');
  await writeFile(file, zip(entries));
  return file;
}
