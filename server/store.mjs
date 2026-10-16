import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEmptyCard, fsrs } from 'ts-fsrs';
import { migrateLegacyDatabase } from './legacy.mjs';
export const hash = (x) => createHash('sha256').update(x).digest('hex');
export const scheduler = fsrs({ enable_fuzz: false, request_retention: 0.9 });
export function cardState(json) {
  if (!json) return createEmptyCard();
  const c = JSON.parse(json);
  c.due = new Date(c.due);
  if (c.last_review) c.last_review = new Date(c.last_review);
  return c;
}
export function dayKey(date = new Date(), tz = 'Asia/Jakarta') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function openStore(dir) {
  mkdirSync(dir, { recursive: true });
  migrateLegacyDatabase(dir);
  const db = new DatabaseSync(path.join(dir, 'cardrove.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, password TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{"dailyNew":20,"goal":20,"timezone":"Asia/Jakarta"}');
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS decks(id TEXT PRIMARY KEY, name TEXT NOT NULL, imported INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS models(id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, model_id TEXT NOT NULL REFERENCES models(id), fields TEXT NOT NULL, tags TEXT NOT NULL, modified INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id), deck_id TEXT NOT NULL REFERENCES decks(id), ord INTEGER NOT NULL, suspended INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS media(name TEXT PRIMARY KEY, disk TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS imports(hash TEXT PRIMARY KEY, name TEXT NOT NULL, at INTEGER NOT NULL, summary TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS progress(user_id INTEGER NOT NULL REFERENCES users(id),card_id TEXT NOT NULL REFERENCES cards(id),state TEXT NOT NULL,due INTEGER NOT NULL,reps INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(user_id,card_id));
  CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),card_id TEXT NOT NULL REFERENCES cards(id),rating INTEGER NOT NULL,at INTEGER NOT NULL,day TEXT NOT NULL,elapsed INTEGER NOT NULL,before_state TEXT,before_version INTEGER NOT NULL,after_version INTEGER NOT NULL,log TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS cards_deck ON cards(deck_id);
  CREATE INDEX IF NOT EXISTS cards_note ON cards(note_id);
  CREATE INDEX IF NOT EXISTS progress_due ON progress(user_id,due);
  CREATE INDEX IF NOT EXISTS reviews_user_day ON reviews(user_id,day);
  `);
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(users)')
      .all()
      .map((c) => c.name),
  );
  for (const [name, type] of [
    ['workspace_name', 'TEXT'],
    ['access_hash', 'TEXT'],
    ['access_saved', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export function importInto(db, p, fileHash, name) {
  return transaction(db, () => {
    const usedDecks = new Set(p.cards.map((c) => c.did));
    const now = Date.now(),
      modelIds = new Map(),
      deckIds = new Map(),
      noteIds = new Map();
    const mediaPrefix = hash(
      [...usedDecks]
        .map((id) => p.decks[id]?.name ?? 'Imported')
        .sort()
        .join('\n'),
    );
    for (const [id, m] of Object.entries(p.models)) {
      const data = { ...m, mediaPrefix };
      const key = hash(id + JSON.stringify(data));
      modelIds.set(id, key);
      db.prepare('INSERT OR IGNORE INTO models VALUES(?,?)').run(key, JSON.stringify(data));
    }
    for (const id of usedDecks) {
      const name = p.decks[id]?.name ?? 'Imported';
      const key = hash(name);
      deckIds.set(id, key);
      db.prepare(
        'INSERT INTO decks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET imported=excluded.imported',
      ).run(key, name, now);
    }
    let added = 0,
      updated = 0;
    for (const n of p.notes) {
      const key = n.guid || hash(n.id + name);
      noteIds.set(n.id, key);
      const exists = db.prepare('SELECT modified FROM notes WHERE id=?').get(key);
      if (!exists) added++;
      else if (n.mod >= exists.modified) updated++;
      db.prepare(
        `INSERT INTO notes VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET model_id=excluded.model_id,fields=excluded.fields,tags=excluded.tags,modified=excluded.modified WHERE excluded.modified>=notes.modified`,
      ).run(key, modelIds.get(n.mid), JSON.stringify(n.flds.split('\x1f')), n.tags.trim(), n.mod);
    }
    let position = 0;
    for (const c of p.cards) {
      const nid = noteIds.get(c.nid);
      if (!nid) throw Error('Referensi kartu tidak valid.');
      const key = hash(nid + ':' + c.ord);
      db.prepare(
        'INSERT INTO cards VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET deck_id=excluded.deck_id',
      ).run(key, nid, deckIds.get(c.did), c.ord, c.queue < 0 ? 1 : 0, position++);
    }
    for (const [name, disk] of Object.entries(p.media))
      db.prepare(
        'INSERT INTO media VALUES(?,?) ON CONFLICT(name) DO UPDATE SET disk=excluded.disk',
      ).run(mediaPrefix + ':' + name, disk);
    const result = {
      notes: p.notes.length,
      cards: p.cards.length,
      media: Object.keys(p.media).length,
      added,
      updated,
      warnings: p.warnings,
    };
    db.prepare('INSERT OR REPLACE INTO imports VALUES(?,?,?,?)').run(
      fileHash,
      name,
      now,
      JSON.stringify(result),
    );
    return result;
  });
}
export const detailedSql = `SELECT c.*, n.fields,n.tags,n.model_id,n.modified,m.data AS model,d.name AS deck_name,p.state,p.version,p.due,p.reps FROM cards c JOIN notes n ON n.id=c.note_id JOIN models m ON m.id=n.model_id JOIN decks d ON d.id=c.deck_id LEFT JOIN progress p ON p.card_id=c.id AND p.user_id=?`;
export function detail(row) {
  if (!row) return null;
  return {
    ...row,
    fields: JSON.parse(row.fields),
    model: JSON.parse(row.model),
    version: row.version ?? 0,
  };
}
export function summary(db, user) {
  const settings = JSON.parse(user.settings),
    today = dayKey(new Date(), settings.timezone),
    now = Date.now();
  const decks = db
    .prepare(
      `SELECT d.*,COUNT(c.id) total,SUM(CASE WHEN COALESCE(p.reps,0)=0 AND c.suspended=0 THEN 1 ELSE 0 END) new_count,SUM(CASE WHEN p.due<=? AND p.reps>0 AND c.suspended=0 THEN 1 ELSE 0 END) due_count,SUM(CASE WHEN p.reps>0 THEN 1 ELSE 0 END) studied FROM decks d JOIN cards c ON c.deck_id=d.id LEFT JOIN progress p ON p.card_id=c.id AND p.user_id=? GROUP BY d.id ORDER BY d.name`,
    )
    .all(now, user.id);
  const reviews = db
    .prepare(
      'SELECT day,COUNT(*) count,SUM(elapsed) elapsed,SUM(CASE WHEN rating>1 THEN 1 ELSE 0 END) correct FROM reviews WHERE user_id=? GROUP BY day ORDER BY day',
    )
    .all(user.id);
  const current = reviews.find((x) => x.day === today) ?? { count: 0, elapsed: 0, correct: 0 };
  const introduced = db
    .prepare(
      "SELECT COUNT(*) count FROM reviews WHERE user_id=? AND day=? AND (before_state IS NULL OR json_extract(before_state,'$.reps')=0)",
    )
    .get(user.id, today).count;
  let streak = 0;
  const days = new Set(reviews.map((x) => x.day));
  const cursor = new Date();
  if (!days.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(dayKey(cursor, settings.timezone))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return {
    decks,
    reviews,
    today: { ...current, introduced },
    streak,
    settings,
    total: decks.reduce((n, d) => n + d.total, 0),
  };
}
export function nextCard(db, user, deckId) {
  const settings = JSON.parse(user.settings),
    today = dayKey(new Date(), settings.timezone),
    params = [user.id];
  let where = 'c.suspended=0';
  if (deckId) {
    where += ' AND c.deck_id=?';
    params.push(deckId);
  }
  const due = db
    .prepare(
      `${detailedSql} WHERE ${where} AND p.reps>0 AND p.due<=? ORDER BY CASE WHEN json_extract(p.state,'$.state') IN (1,3) THEN 0 ELSE 1 END,p.due,c.position LIMIT 1`,
    )
    .get(...params, Date.now());
  let row = due;
  const introduced = db
    .prepare(
      "SELECT COUNT(*) count FROM reviews WHERE user_id=? AND day=? AND (before_state IS NULL OR json_extract(before_state,'$.reps')=0)",
    )
    .get(user.id, today).count;
  if (!row && introduced < settings.dailyNew)
    row = db
      .prepare(
        `${detailedSql} WHERE ${where} AND COALESCE(p.reps,0)=0 AND NOT EXISTS(SELECT 1 FROM reviews r JOIN cards sibling ON sibling.id=r.card_id WHERE r.user_id=? AND r.day=? AND sibling.note_id=c.note_id AND sibling.id!=c.id) ORDER BY c.position,c.id LIMIT 1`,
      )
      .get(...params, user.id, today);
  const upcoming = db
    .prepare(`${detailedSql} WHERE ${where} AND p.due>? ORDER BY p.due LIMIT 1`)
    .get(...params, Date.now());
  if (!row)
    return {
      card: null,
      nextDue: upcoming?.due ?? null,
      dailyLimit: introduced >= settings.dailyNew,
    };
  const card = detail(row),
    preview = scheduler.repeat(cardState(card.state), new Date());
  return {
    card,
    intervals: Object.fromEntries(
      [1, 2, 3, 4].map((r) => [r, preview[r].card.due.getTime() - Date.now()]),
    ),
  };
}
