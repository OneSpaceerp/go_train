// Go Train API. Express + PostgreSQL. Thin handlers across every Train Track area.
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { query, getDb, hasDbUrl } from './db.js';
import { initDb } from './initdb.js';
import { hashPassword, checkPassword, signToken, requireAuth, requireRole } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
const IS_PROD = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN; // set when Vercel Blob is attached
if (!IS_PROD) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// In dev, attachments live on disk and are served here. In production they go to
// Vercel Blob (absolute URLs), so this route is unused there.
app.use('/uploads', express.static(UPLOAD_DIR));

// Keep the uploaded file in memory, then store it on disk (dev) or Vercel Blob (prod).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: 'Server error' });
});
const one = async (sql, params) => (await query(sql, params)).rows[0] || null;
const many = async (sql, params) => (await query(sql, params)).rows;

// --- Health & config ---------------------------------------------------------
// Diagnostic: reports whether the database connects, and why not if it doesn't.
app.get('/api/health', async (_req, res) => {
  try {
    const db = await getDb();
    await db.query('SELECT 1');
    res.json({ ok: true, db: db.kind, database_url: hasDbUrl() });
  } catch (e) {
    res.status(200).json({ ok: false, database_url: hasDbUrl(), error: e.message });
  }
});
app.get('/api/config', wrap(async (_req, res) => {
  res.json({ app: 'Go Train', version: '0.1.0', demoPassword: 'gotrain' });
}));

// --- Auth --------------------------------------------------------------------
app.post('/api/auth/register', wrap(async (req, res) => {
  const { email, password, full_name, role = 'client' } = req.body || {};
  if (!email || !password || !full_name) return res.status(400).json({ error: 'email, password and name are required' });
  if (!['client', 'coach'].includes(role)) return res.status(400).json({ error: 'role must be client or coach' });
  if (await one('SELECT id FROM users WHERE email=$1', [email])) return res.status(409).json({ error: 'Email already registered' });
  const hash = await hashPassword(password);
  const user = await one(
    `INSERT INTO users(email,password_hash,full_name,role) VALUES ($1,$2,$3,$4)
     RETURNING id,email,full_name,role,locale,theme`, [email, hash, full_name, role]);
  if (role === 'coach') await query('INSERT INTO coach_profiles(user_id) VALUES ($1)', [user.id]);
  else await query('INSERT INTO client_profiles(user_id) VALUES ($1)', [user.id]);
  res.status(201).json({ token: signToken(user), user });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const row = await one('SELECT * FROM users WHERE email=$1', [email]);
  if (!row || !(await checkPassword(password || '', row.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  const { password_hash, ...user } = row;
  res.json({ token: signToken(row), user });
}));

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.patch('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const { full_name, locale, theme, bio, phone } = req.body || {};
  const user = await one(
    `UPDATE users SET full_name=COALESCE($2,full_name), locale=COALESCE($3,locale),
       theme=COALESCE($4,theme), bio=COALESCE($5,bio), phone=COALESCE($6,phone)
     WHERE id=$1 RETURNING id,email,full_name,role,locale,theme,bio,phone,avatar_url`,
    [req.user.id, full_name, locale, theme, bio, phone]);
  res.json({ user });
}));

// --- Programs & workouts (athlete) ------------------------------------------
// Programs the signed-in client is enrolled in (or, for a coach, programs they own).
app.get('/api/programs', requireAuth, wrap(async (req, res) => {
  if (req.user.role === 'coach') {
    return res.json(await many(
      `SELECT p.*, (SELECT count(*)::int FROM workouts w WHERE w.program_id=p.id) AS workout_count,
              (SELECT count(*)::int FROM client_programs cp WHERE cp.program_id=p.id) AS client_count
       FROM programs p WHERE p.owner_id=$1 ORDER BY p.created_at DESC`, [req.user.id]));
  }
  res.json(await many(
    `SELECT p.*, cp.is_active, cp.started_on,
            (SELECT count(*)::int FROM workouts w WHERE w.program_id=p.id) AS workout_count,
            (SELECT count(*)::int FROM workout_logs wl JOIN workouts w ON w.id=wl.workout_id
               WHERE w.program_id=p.id AND wl.client_id=$1 AND wl.status='done') AS done_count
     FROM client_programs cp JOIN programs p ON p.id=cp.program_id
     WHERE cp.client_id=$1 ORDER BY cp.is_active DESC, cp.started_on DESC`, [req.user.id]));
}));

app.get('/api/programs/:id/workouts', requireAuth, wrap(async (req, res) => {
  res.json(await many(
    `SELECT w.*,
            (SELECT row_to_json(l) FROM (
               SELECT status, result, details, attachment_url, logged_on
               FROM workout_logs WHERE workout_id=w.id AND client_id=$2
               ORDER BY created_at DESC LIMIT 1) l) AS my_log,
            (SELECT count(*)::int FROM workout_comments c WHERE c.workout_id=w.id) AS comment_count
     FROM workouts w WHERE w.program_id=$1 ORDER BY w.position, w.scheduled_on DESC`,
    [req.params.id, req.user.id]));
}));

app.get('/api/workouts/:id', requireAuth, wrap(async (req, res) => {
  const w = await one('SELECT * FROM workouts WHERE id=$1', [req.params.id]);
  if (!w) return res.status(404).json({ error: 'Workout not found' });
  w.log = await one(`SELECT * FROM workout_logs WHERE workout_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 1`, [w.id, req.user.id]);
  w.comments = await many(
    `SELECT c.id, c.body, c.created_at, u.full_name AS author, u.role AS author_role
     FROM workout_comments c JOIN users u ON u.id=c.author_id
     WHERE c.workout_id=$1 ORDER BY c.created_at`, [w.id]);
  res.json(w);
}));

app.post('/api/workouts/:id/log', requireAuth, wrap(async (req, res) => {
  const { status = 'done', result = null, details = null,
          attachment_url = null, attachment_name = null,
          rpe = null, duration_seconds = null } = req.body || {};
  const log = await one(
    `INSERT INTO workout_logs(workout_id,client_id,status,result,details,attachment_url,attachment_name,rpe,duration_seconds)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, req.user.id, status, result, details, attachment_url, attachment_name, rpe, duration_seconds]);
  res.status(201).json(log);
}));

// All of this client's logs for one workout (newest first) — "previous results".
app.get('/api/workouts/:id/logs', requireAuth, wrap(async (req, res) => {
  res.json(await many(
    `SELECT * FROM workout_logs WHERE workout_id=$1 AND client_id=$2 ORDER BY created_at DESC`,
    [req.params.id, req.user.id]));
}));

// Upload one attachment; returns a URL to store on a log.
app.post('/api/uploads', requireAuth, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const safe = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  if (USE_BLOB) {
    const { put } = await import('@vercel/blob');
    const { url } = await put(`uploads/${filename}`, req.file.buffer, {
      access: 'public', contentType: req.file.mimetype, token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.status(201).json({ url, name: req.file.originalname, size: req.file.size });
  }
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
  res.status(201).json({ url: `/uploads/${filename}`, name: req.file.originalname, size: req.file.size });
}));

// Calendar: every scheduled workout in the client's enrolled programs, with its
// log status — powers the month grid on the Train home.
app.get('/api/calendar', requireAuth, wrap(async (req, res) => {
  res.json(await many(
    `SELECT w.id, w.title, w.scheduled_on, p.name AS program,
            (SELECT status FROM workout_logs wl WHERE wl.workout_id=w.id AND wl.client_id=$1
               ORDER BY created_at DESC LIMIT 1) AS status
     FROM client_programs cp
     JOIN workouts w ON w.program_id=cp.program_id
     JOIN programs p ON p.id=w.program_id
     WHERE cp.client_id=$1 AND w.scheduled_on IS NOT NULL
     ORDER BY w.scheduled_on`, [req.user.id]));
}));

app.post('/api/workouts/:id/comments', requireAuth, wrap(async (req, res) => {
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'Comment body required' });
  const c = await one(
    `INSERT INTO workout_comments(workout_id,author_id,body) VALUES ($1,$2,$3) RETURNING id,body,created_at`,
    [req.params.id, req.user.id, body]);
  res.status(201).json({ ...c, author: req.user.full_name, author_role: req.user.role });
}));

// Workout history + search (powers the History sheet).
app.get('/api/history', requireAuth, wrap(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const rows = await many(
    `SELECT w.id, w.title, w.body, w.scheduled_on, p.name AS program,
            wl.status, wl.result, wl.logged_on
     FROM workout_logs wl
     JOIN workouts w ON w.id=wl.workout_id
     JOIN programs p ON p.id=w.program_id
     WHERE wl.client_id=$1
       AND ($2='' OR w.title ILIKE '%'||$2||'%' OR w.body ILIKE '%'||$2||'%'
            OR wl.result ILIKE '%'||$2||'%' OR p.name ILIKE '%'||$2||'%')
     ORDER BY COALESCE(wl.logged_on, w.scheduled_on) DESC`, [req.user.id, q]);
  res.json(rows);
}));

// --- Exercise library --------------------------------------------------------
app.get('/api/exercises', requireAuth, wrap(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  res.json(await many(
    `SELECT * FROM exercises WHERE ($1='' OR name ILIKE '%'||$1||'%' OR category ILIKE '%'||$1||'%')
     ORDER BY category, name`, [q]));
}));

// --- Messaging ---------------------------------------------------------------
app.get('/api/threads', requireAuth, wrap(async (req, res) => {
  const col = req.user.role === 'coach' ? 'coach_id' : 'client_id';
  const otherName = req.user.role === 'coach' ? 'cl.full_name' : 'co.full_name';
  res.json(await many(
    `SELECT t.id, ${otherName} AS other_name,
            (SELECT body FROM messages m WHERE m.thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM messages m WHERE m.thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS last_at
     FROM message_threads t
     JOIN users co ON co.id=t.coach_id JOIN users cl ON cl.id=t.client_id
     WHERE t.${col}=$1 ORDER BY last_at DESC NULLS LAST`, [req.user.id]));
}));

app.get('/api/threads/:id/messages', requireAuth, wrap(async (req, res) => {
  res.json(await many(
    `SELECT m.id, m.body, m.created_at, m.sender_id, u.full_name AS sender_name,
            (m.sender_id=$2) AS mine
     FROM messages m JOIN users u ON u.id=m.sender_id
     WHERE m.thread_id=$1 ORDER BY m.created_at`, [req.params.id, req.user.id]));
}));

app.post('/api/threads/:id/messages', requireAuth, wrap(async (req, res) => {
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'Message body required' });
  const m = await one(`INSERT INTO messages(thread_id,sender_id,body) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, req.user.id, body]);
  res.status(201).json({ ...m, mine: true, sender_name: req.user.full_name });
}));

// --- Notifications -----------------------------------------------------------
app.get('/api/notifications', requireAuth, wrap(async (req, res) => {
  res.json(await many('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]));
}));
app.post('/api/notifications/read', requireAuth, wrap(async (req, res) => {
  await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

// --- Progress tracking & insights -------------------------------------------
app.get('/api/tracking', requireAuth, wrap(async (req, res) => {
  const rows = await many(
    `SELECT metric, unit, value, recorded_on FROM tracking_entries
     WHERE client_id=$1 ORDER BY metric, recorded_on`, [req.user.id]);
  const series = {};
  for (const r of rows) (series[r.metric] ??= { metric: r.metric, unit: r.unit, points: [] })
    .points.push({ date: r.recorded_on, value: Number(r.value) });
  res.json(Object.values(series));
}));
app.post('/api/tracking', requireAuth, wrap(async (req, res) => {
  const { metric, unit = 'kg', value, recorded_on } = req.body || {};
  if (!metric || value == null) return res.status(400).json({ error: 'metric and value required' });
  const row = await one(
    `INSERT INTO tracking_entries(client_id,metric,unit,value,recorded_on)
     VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE)) RETURNING *`,
    [req.user.id, metric, unit, value, recorded_on || null]);
  res.status(201).json(row);
}));
app.get('/api/insights', requireAuth, wrap(async (req, res) => {
  const [{ done }, { missed }, { logged }] = await Promise.all([
    one(`SELECT count(*)::int AS done FROM workout_logs WHERE client_id=$1 AND status='done'`, [req.user.id]),
    one(`SELECT count(*)::int AS missed FROM workout_logs WHERE client_id=$1 AND status='missed'`, [req.user.id]),
    one(`SELECT count(DISTINCT logged_on)::int AS logged FROM workout_logs WHERE client_id=$1`, [req.user.id]),
  ]);
  res.json({ done, missed, logged, completion: done + missed ? Math.round((done / (done + missed)) * 100) : 0 });
}));

// --- Coach -------------------------------------------------------------------
app.get('/api/coach/clients', requireAuth, requireRole('coach'), wrap(async (req, res) => {
  res.json(await many(
    `SELECT u.id, u.full_name, u.email, u.avatar_url, cc.status,
            (SELECT count(*)::int FROM client_programs cp WHERE cp.client_id=u.id AND cp.is_active) AS active_programs
     FROM coach_clients cc JOIN users u ON u.id=cc.client_id
     WHERE cc.coach_id=$1 ORDER BY u.full_name`, [req.user.id]));
}));
app.post('/api/coach/programs', requireAuth, requireRole('coach'), wrap(async (req, res) => {
  const { name, description, kind = 'ongoing' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Program name required' });
  const p = await one(`INSERT INTO programs(name,description,kind,owner_id) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, description || null, kind, req.user.id]);
  res.status(201).json(p);
}));

// --- Gym team ----------------------------------------------------------------
app.get('/api/gym/team', requireAuth, wrap(async (req, res) => {
  const team = await one(
    `SELECT t.* FROM gym_teams t
     LEFT JOIN gym_members gm ON gm.team_id=t.id
     WHERE t.owner_id=$1 OR gm.user_id=$1 LIMIT 1`, [req.user.id]);
  if (!team) return res.json(null);
  team.roles = await many('SELECT * FROM gym_roles WHERE team_id=$1 ORDER BY name', [team.id]);
  team.members = await many(
    `SELECT gm.id, u.full_name, u.email, u.role AS user_role, r.name AS team_role, gm.is_paying_client
     FROM gym_members gm JOIN users u ON u.id=gm.user_id
     LEFT JOIN gym_roles r ON r.id=gm.role_id WHERE gm.team_id=$1 ORDER BY u.full_name`, [team.id]);
  team.join_requests = await many(
    `SELECT jr.id, u.full_name, u.email, jr.status, jr.created_at
     FROM join_requests jr JOIN users u ON u.id=jr.user_id
     WHERE jr.team_id=$1 AND jr.status='pending'`, [team.id]);
  res.json(team);
}));

// --- Marketplace -------------------------------------------------------------
app.get('/api/marketplace', requireAuth, wrap(async (req, res) => {
  res.json(await many(
    `SELECT l.*, u.full_name AS seller_name, p.name AS program_name
     FROM marketplace_listings l JOIN users u ON u.id=l.seller_id JOIN programs p ON p.id=l.program_id
     WHERE l.is_published ORDER BY l.created_at DESC`));
}));
app.get('/api/marketplace/purchases', requireAuth, wrap(async (req, res) => {
  res.json(await many(
    `SELECT mp.*, l.title FROM marketplace_purchases mp JOIN marketplace_listings l ON l.id=mp.listing_id
     WHERE mp.buyer_id=$1 ORDER BY mp.purchased_at DESC`, [req.user.id]));
}));
app.get('/api/marketplace/sales', requireAuth, requireRole('coach'), wrap(async (req, res) => {
  res.json(await many(
    `SELECT mp.*, l.title, b.full_name AS buyer_name
     FROM marketplace_purchases mp JOIN marketplace_listings l ON l.id=mp.listing_id
     JOIN users b ON b.id=mp.buyer_id WHERE l.seller_id=$1 ORDER BY mp.purchased_at DESC`, [req.user.id]));
}));
app.post('/api/marketplace/:id/buy', requireAuth, wrap(async (req, res) => {
  const listing = await one('SELECT * FROM marketplace_listings WHERE id=$1', [req.params.id]);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  const p = await one(
    `INSERT INTO marketplace_purchases(listing_id,buyer_id,price_cents,currency) VALUES ($1,$2,$3,$4) RETURNING *`,
    [listing.id, req.user.id, listing.price_cents, listing.currency]);
  res.status(201).json(p);
}));

// --- Promos & subscription ---------------------------------------------------
app.get('/api/promos', requireAuth, wrap(async (_req, res) => {
  res.json(await many(`SELECT * FROM promos WHERE active ORDER BY percent_off DESC`));
}));
app.get('/api/subscription', requireAuth, wrap(async (req, res) => {
  res.json(await one('SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [req.user.id]));
}));

const PORT = process.env.PORT || 4000;
if (IS_PROD) {
  // Production: the schema + seed are applied once out-of-band (npm run db:setup
  // against DATABASE_URL), never on every cold start. Just serve.
  app.listen(PORT, () => console.log(`[go-train] API listening on ${PORT}`));
} else {
  // Dev: create and seed the embedded database on first run, then serve.
  initDb()
    .then(() => app.listen(PORT, () => console.log(`[go-train] API on http://localhost:${PORT}`)))
    .catch((e) => { console.error('Failed to start:', e); process.exit(1); });
}

export default app;
