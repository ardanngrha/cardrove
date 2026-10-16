import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parsePackage, commitMedia } from '../server/import.mjs';
import { openStore, importInto, nextCard, summary, dayKey } from '../server/store.mjs';
import { fixture, zip } from './helpers.mjs';
test('legacy and modern packages preserve fields, reversed templates, hierarchy and media', async () => {
  for (const modern of [false, true]) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cardrove-import-'));
    try {
      const file = await fixture(dir, modern),
        p = await parsePackage(file, dir);
      assert.equal(p.notes.length, 2);
      assert.equal(p.cards.length, 3);
      assert.equal(p.decks['20'].name, 'Japanese::Test');
      assert.equal(p.models['10'].tmpls[1].qfmt, '{{Back}}');
      assert.equal(p.models['10'].flds[1].name, 'Back');
      assert.equal(p.notes[0].flds, '学ぶ\x1fbelajar');
      await commitMedia(p, dir);
      assert.equal(
        (await readFile(path.join(dir, 'media', p.media['sample.mp3']))).toString(),
        'test-media',
      );
      const db = openStore(dir);
      try {
        const result = importInto(db, p, 'hash', 'test.apkg');
        assert.equal(result.added, 2);
        db.prepare('INSERT INTO users(name,password) VALUES(?,?)').run('test', 'test');
        const user = db.prepare('SELECT * FROM users').get(),
          first = nextCard(db, user);
        assert.ok(first.card);
        assert.equal(first.card.modified, 100);
        assert.ok(first.intervals[4] > first.intervals[1]);
        const again = importInto(db, p, 'new-hash', 'test.apkg');
        assert.equal(again.added, 0);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM cards').get().n, 3);
        assert.equal(summary(db, user).total, 3);
      } finally {
        db.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});
test('invalid archives and unsafe paths are rejected without touching existing data', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cardrove-bad-'));
  try {
    const file = path.join(dir, 'bad.apkg');
    await writeFile(file, zip([['../../outside', 'bad']]));
    await assert.rejects(parsePackage(file, dir));
    await writeFile(file, Buffer.from('not a zip'));
    await assert.rejects(parsePackage(file, dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('calendar uses the selected timezone at day boundaries', () => {
  assert.equal(dayKey(new Date('2026-10-15T18:00:00Z'), 'Asia/Jakarta'), '2026-10-16');
  assert.equal(dayKey(new Date('2026-10-15T18:00:00Z'), 'UTC'), '2026-10-15');
});
