import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { zip } from '../tests/helpers.mjs';

// Original sample content for the film; this never reads the owner's collection.
const dir = path.resolve('work/video-demo');
await mkdir(dir, { recursive: true });
const db = new DatabaseSync(':memory:');
db.exec(
  'CREATE TABLE notes(id INTEGER,guid TEXT,mid INTEGER,mod INTEGER,tags TEXT,flds TEXT); CREATE TABLE cards(id INTEGER,nid INTEGER,did INTEGER,ord INTEGER,queue INTEGER,due INTEGER); CREATE TABLE col(models TEXT,decks TEXT);',
);
const model = {
  name: 'Cardrove sample',
  type: 0,
  css: '.card { font-family: Georgia, serif; font-size: 29px; text-align: center; color: #2c2b27; padding: 28px; } .hint { font-family: sans-serif; font-size: 13px; color: #68665e; margin-bottom: 30px; }',
  flds: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 },
  ],
  tmpls: [{ name: 'Recall', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }],
};
const sets = [
  [
    20,
    'French · everyday words',
    [
      ['<div class="hint">FRENCH → ENGLISH</div>le soleil', 'the sun'],
      ['<div class="hint">FRENCH → ENGLISH</div>une fenêtre', 'a window'],
      ['<div class="hint">FRENCH → ENGLISH</div>se souvenir', 'to remember'],
      ['<div class="hint">FRENCH → ENGLISH</div>le lendemain', 'the following day'],
    ],
  ],
  [
    30,
    'Science · small discoveries',
    [
      [
        'What does a prism do to white light?',
        'It separates the light into its component colours.',
      ],
      ['What is the chemical symbol for gold?', 'Au'],
      ['Which organelle releases energy from nutrients?', 'The mitochondrion.'],
      ['What force keeps planets in orbit around the Sun?', 'Gravity.'],
    ],
  ],
  [
    40,
    'Design · ways of seeing',
    [
      [
        'What does visual hierarchy help a reader do?',
        'Notice the most important information first.',
      ],
      ['What is negative space?', 'The space around and between elements.'],
      ['What does a baseline align?', 'The bottoms of letters, excluding descenders.'],
      ['What does contrast communicate?', 'Difference, emphasis, and hierarchy.'],
    ],
  ],
];
let id = 1;
for (const [deck, , notes] of sets)
  for (const [front, back] of notes) {
    db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?)').run(
      id,
      'cardrove-original-sample-' + id,
      10,
      1792100000,
      ' sample ',
      front + '\x1f' + back,
    );
    db.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?)').run(id, id, deck, 0, 0, id);
    id++;
  }
db.prepare('INSERT INTO col VALUES(?,?)').run(
  JSON.stringify({ 10: model }),
  JSON.stringify(Object.fromEntries(sets.map(([id, name]) => [id, { name }]))),
);
const location = path.join(dir, 'collection.sqlite');
await rm(location, { force: true });
db.exec(`VACUUM INTO '${location.replaceAll("'", "''")}'`);
db.close();
const file = path.join(dir, 'Cardrove sample collection.apkg');
await writeFile(
  file,
  zip([
    ['collection.anki21', await readFile(location)],
    ['media', Buffer.from('{}')],
  ]),
);
console.log('Original 12-card sample package created in work/video-demo/.');
