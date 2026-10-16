import express from 'express';
import multer from 'multer';
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { parsePackage, commitMedia } from './import.mjs';
import {
  openStore,
  importInto,
  summary,
  nextCard,
  detailedSql,
  detail,
  transaction,
  cardState,
  scheduler,
  dayKey,
} from './store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = path.resolve(process.env.MYANKI_DATA_DIR ?? path.join(root, 'data'));
const db = openStore(dataDir),
  app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');
mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
const upload = multer({
  dest: path.join(dataDir, 'uploads'),
  limits: { fileSize: 512 * 1024 ** 2, files: 1, fields: 0 },
});
const digest = (x) => createHash('sha256').update(x).digest('hex');
const error = (message, status = 400) => Object.assign(Error(message), { status });
const passwordHash = (password) => {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
};
const validPassword = (password, stored) => {
  const [salt, hex] = stored.split(':');
  return timingSafeEqual(Buffer.from(hex, 'hex'), scryptSync(password, salt, 64));
};
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (origin) {
      let originHost;
      try {
        originHost = new URL(origin).host;
      } catch {
        throw error('Origin tidak valid.', 403);
      }
      if (originHost !== req.get('host')) throw error('Permintaan lintas situs ditolak.', 403);
    } else if (!req.get('x-myanki')) throw error('Header permintaan tidak valid.', 403);
  }
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/api', (req, res, next) => {
  const raw = (req.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('myanki='))
    ?.slice(7);
  if (raw) {
    const session = db
      .prepare(
        'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',
      )
      .get(digest(raw), Date.now());
    req.user = session;
  }
  next();
});
const auth = (req, res, next) => (req.user ? next() : next(error('Silakan masuk dulu.', 401)));
app.get('/api/session', (req, res) =>
  res.json({
    setup: !db.prepare('SELECT id FROM users LIMIT 1').get(),
    user: req.user ? { name: req.user.name } : null,
  }),
);
const attempts = new Map();
app.post('/api/auth', (req, res) => {
  const key = req.ip,
    now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.count >= 10)
    throw error('Terlalu banyak percobaan. Coba lagi dalam 15 menit.', 429);
  const { name, password } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    name.length > 64 ||
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 256
  )
    throw error('Nama minimal 2 karakter dan kata sandi minimal 8 karakter.');
  let user = db.prepare('SELECT * FROM users WHERE name=?').get(name.trim());
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    db.prepare('INSERT INTO users(name,password) VALUES(?,?)').run(
      name.trim(),
      passwordHash(password),
    );
    user = db.prepare('SELECT * FROM users WHERE name=?').get(name.trim());
  }
  if (!user || !validPassword(password, user.password)) {
    attempts.set(key, { count: (a?.until > now ? a.count : 0) + 1, until: now + 15 * 60000 });
    throw error('Nama atau kata sandi belum cocok.', 401);
  }
  attempts.delete(key);
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), user.id, now + 30 * 86400000);
  res.cookie('myanki', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: 30 * 86400000,
  });
  res.json({ name: user.name });
});
app.post('/api/logout', auth, (req, res) => {
  const raw = (req.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('myanki='))
    ?.slice(7);
  if (raw) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(raw));
  res.clearCookie('myanki');
  res.json({ ok: true });
});
app.get('/api/summary', auth, (req, res) => res.json(summary(db, req.user)));
app.get('/api/next', auth, (req, res) =>
  res.json(nextCard(db, req.user, typeof req.query.deck === 'string' ? req.query.deck : undefined)),
);
app.get('/api/card/:id', auth, (req, res) => {
  const c = detail(db.prepare(`${detailedSql} WHERE c.id=?`).get(req.user.id, req.params.id));
  if (!c) throw error('Kartu tidak ditemukan.', 404);
  res.json(c);
});
app.post('/api/review', auth, (req, res) => {
  const { id, rating, version, elapsed } = req.body ?? {};
  if (typeof id !== 'string' || ![1, 2, 3, 4].includes(rating) || !Number.isInteger(version))
    throw error('Jawaban tidak valid.');
  const result = transaction(db, () => {
    const row = db.prepare(`${detailedSql} WHERE c.id=?`).get(req.user.id, id);
    if (!row) throw error('Kartu tidak ditemukan.', 404);
    if ((row.version ?? 0) !== version)
      throw error('Kartu ini sudah berubah di device lain. Muat kartu terbaru.', 409);
    if (row.due && row.due > Date.now())
      throw error('Kartu ini sudah dijadwalkan. Muat kartu terbaru.', 409);
    const now = new Date(),
      before = row.state ?? null,
      state = scheduler.next(cardState(before), now, rating),
      nextVersion = version + 1;
    db.prepare(
      'INSERT INTO progress VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET state=excluded.state,due=excluded.due,reps=excluded.reps,version=excluded.version',
    ).run(
      req.user.id,
      id,
      JSON.stringify(state.card),
      state.card.due.getTime(),
      state.card.reps,
      nextVersion,
    );
    const log = db
      .prepare(
        'INSERT INTO reviews(user_id,card_id,rating,at,day,elapsed,before_state,before_version,after_version,log) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        req.user.id,
        id,
        rating,
        now.getTime(),
        dayKey(now, JSON.parse(req.user.settings).timezone),
        Math.max(0, Math.min(Number(elapsed) || 0, 300000)),
        before,
        version,
        nextVersion,
        JSON.stringify(state.log),
      );
    return { reviewId: Number(log.lastInsertRowid), due: state.card.due };
  });
  res.json(result);
});
app.post('/api/undo', auth, (req, res) => {
  transaction(db, () => {
    const r = db
      .prepare('SELECT * FROM reviews WHERE user_id=? ORDER BY id DESC LIMIT 1')
      .get(req.user.id);
    if (!r || r.id !== req.body.reviewId)
      throw error('Hanya jawaban terakhir yang bisa dibatalkan.', 409);
    const p = db
      .prepare('SELECT version FROM progress WHERE user_id=? AND card_id=?')
      .get(req.user.id, r.card_id);
    if (!p || p.version !== r.after_version) throw error('Progress sudah berubah.', 409);
    // Keep a monotonically increasing version even when reverting the first answer.
    if (r.before_state) {
      const s = cardState(r.before_state);
      db.prepare(
        'UPDATE progress SET state=?,due=?,reps=?,version=? WHERE user_id=? AND card_id=?',
      ).run(r.before_state, s.due.getTime(), s.reps, p.version + 1, req.user.id, r.card_id);
    } else
      db.prepare(
        'UPDATE progress SET state=?,due=?,reps=0,version=? WHERE user_id=? AND card_id=?',
      ).run(JSON.stringify(cardState(null)), Date.now(), p.version + 1, req.user.id, r.card_id);
    db.prepare('DELETE FROM reviews WHERE id=?').run(r.id);
  });
  res.json({ ok: true });
});
app.get('/api/cards', auth, (req, res) => {
  const q = String(req.query.q ?? '').slice(0, 200),
    deck = String(req.query.deck ?? ''),
    page = Math.max(0, Math.min(Number(req.query.page) || 0, 100000));
  let where = '1=1';
  const params = [req.user.id];
  if (deck) {
    where += ' AND c.deck_id=?';
    params.push(deck);
  }
  if (q) {
    where += " AND (n.fields LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\')";
    const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    params.push(pattern, pattern);
  }
  const rows = db
    .prepare(`${detailedSql} WHERE ${where} ORDER BY c.position,c.id LIMIT 50 OFFSET ?`)
    .all(...params, page * 50)
    .map(detail);
  const total = db
    .prepare(`SELECT COUNT(*) count FROM (${detailedSql} WHERE ${where})`)
    .get(...params).count;
  res.json({ cards: rows, total });
});
app.patch('/api/notes/:id', auth, (req, res) => {
  const { fields, modified } = req.body ?? {};
  if (
    !Array.isArray(fields) ||
    !fields.every((x) => typeof x === 'string') ||
    JSON.stringify(fields).length > 1000000 ||
    !Number.isInteger(modified)
  )
    throw error('Isi catatan tidak valid.');
  const n = db.prepare('SELECT * FROM notes WHERE id=?').get(req.params.id);
  if (!n) throw error('Catatan tidak ditemukan.', 404);
  if (n.modified !== modified)
    throw error('Catatan berubah di device lain. Buka ulang sebelum menyimpan.', 409);
  const model = JSON.parse(db.prepare('SELECT data FROM models WHERE id=?').get(n.model_id).data);
  if (fields.length !== model.flds.length) throw error('Jumlah field tidak cocok.');
  db.prepare('UPDATE notes SET fields=?,modified=? WHERE id=?').run(
    JSON.stringify(fields),
    Math.max(n.modified + 1, Math.floor(Date.now() / 1000)),
    req.params.id,
  );
  res.json({ ok: true });
});
app.patch('/api/settings', auth, (req, res) => {
  const { dailyNew, goal, timezone } = req.body ?? {};
  if (
    !Number.isInteger(dailyNew) ||
    dailyNew < 0 ||
    dailyNew > 500 ||
    !Number.isInteger(goal) ||
    goal < 1 ||
    goal > 1000 ||
    typeof timezone !== 'string'
  )
    throw error('Pengaturan tidak valid.');
  try {
    dayKey(new Date(), timezone);
  } catch {
    throw error('Zona waktu tidak valid.');
  }
  db.prepare('UPDATE users SET settings=? WHERE id=?').run(
    JSON.stringify({ dailyNew, goal, timezone }),
    req.user.id,
  );
  res.json({ ok: true });
});
let importing = false;
app.post('/api/import', auth, (req, res, next) => {
  if (importing) return next(error('Impor lain sedang berjalan. Tunggu sebentar.', 409));
  importing = true;
  upload.single('deck')(req, res, async (err) => {
    try {
      if (err) throw err;
      if (!req.file) throw error('Pilih file .apkg.');
      if (!/\.apkg$/i.test(req.file.originalname))
        throw error('Gunakan deck .apkg; koleksi .colpkg belum didukung.');
      const h = await new Promise((resolve, reject) => {
        const sha = createHash('sha256');
        const stream = createReadStream(req.file.path);
        stream.on('data', (b) => sha.update(b));
        stream.on('end', () => resolve(sha.digest('hex')));
        stream.on('error', reject);
      });
      const exists = db.prepare('SELECT summary FROM imports WHERE hash=?').get(h);
      if (exists) return res.json({ ...JSON.parse(exists.summary), duplicate: true });
      const parsed = await parsePackage(req.file.path, dataDir);
      await commitMedia(parsed, dataDir);
      const result = importInto(db, parsed, h, req.file.originalname);
      res.json(result);
    } catch (e) {
      next(e);
    } finally {
      importing = false;
      if (req.file) await rm(req.file.path, { force: true });
    }
  });
});
app.get('/api/media/:name', auth, (req, res) => {
  const media = db.prepare('SELECT disk FROM media WHERE name=?').get(req.params.name);
  if (!media) throw error('Media tidak ditemukan.', 404);
  const ext = path.extname(media.disk);
  const types = {
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  res.set({
    'Content-Type': types[ext] ?? 'application/octet-stream',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': 'private,max-age=86400',
  });
  res.sendFile(path.join(dataDir, 'media', media.disk));
});
app.get('/api/export', auth, (req, res) => {
  const data = {
    format: 'MyAnki',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: JSON.parse(req.user.settings),
    progress: db
      .prepare('SELECT card_id,state,due,reps,version FROM progress WHERE user_id=?')
      .all(req.user.id),
    reviews: db
      .prepare('SELECT card_id,rating,at,day,elapsed,log FROM reviews WHERE user_id=?')
      .all(req.user.id),
  };
  res.attachment('myanki-progress.json').json(data);
});
app.use('/api', (req, res) => res.status(404).json({ error: 'Halaman tidak ditemukan.' }));
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else if (!process.argv.includes('--api-only')) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err.message);
  res
    .status(err.status ?? (err instanceof multer.MulterError ? 400 : 400))
    .json({
      error:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Ukuran deck maksimal 512 MB.'
          : (err.message ?? 'Terjadi kesalahan.'),
    });
});
const port = Number(process.env.PORT ?? 4317),
  host = process.env.HOST ?? '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`Cardrove ready: http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces()))
    for (const n of list ?? [])
      if (n.family === 'IPv4' && !n.internal) console.log(`Network: http://${n.address}:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
