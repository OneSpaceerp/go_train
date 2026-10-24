// Database layer. One small interface — db.query(sql, params) — backed by:
//   * a real Postgres server when DATABASE_URL is set (node-pg), or
//   * PGlite (Postgres compiled to WASM, persisted to ./.pgdata) otherwise.
// Both speak the same SQL, so the schema and queries are identical either way.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (KEY=VALUE lines) so we need no dotenv dependency.
try {
  const envPath = path.resolve(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env file is fine */ }

const DATA_DIR = path.resolve(__dirname, '..', '.pgdata');

let impl; // { query, kind }

const IS_PROD = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Providers expose the connection under different env names. We use node-pg, which
// needs a standard postgres:// / postgresql:// URL — NOT Prisma's prisma+postgres://
// (Accelerate) URL. So gather all candidates and pick the first real TCP string.
const RAW_URLS = () =>
  [process.env.DATABASE_URL, process.env.POSTGRES_URL, process.env.PRISMA_DATABASE_URL, process.env.POSTGRES_PRISMA_URL]
    .filter(Boolean);
const dbUrl = () => RAW_URLS().find((u) => /^postgres(ql)?:\/\//i.test(u)) || null;

export async function getDb() {
  if (impl) return impl;
  const url = dbUrl();
  if (url) {
    const { default: pg } = await import('pg');
    // On serverless (Vercel), keep the pool tiny — many short-lived instances
    // share the database. Use a pooled/PgBouncer connection string.
    const pool = new pg.Pool({ connectionString: url, max: IS_PROD ? 1 : 10 });
    await pool.query('SELECT 1');
    impl = { kind: 'postgres', query: (text, params) => pool.query(text, params), pool };
    console.log('[db] connected to Postgres via DATABASE_URL');
  } else if (IS_PROD) {
    // PGlite writes to local disk and cannot persist on serverless — refuse to
    // start silently with a throwaway database in production.
    if (RAW_URLS().length) {
      throw new Error('A database is attached but no standard postgres:// connection string was found. ' +
        'Prisma Accelerate URLs (prisma+postgres://) are not supported — use the direct POSTGRES_URL.');
    }
    throw new Error('DATABASE_URL is required in production. PGlite is for local dev only.');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite(DATA_DIR);
    await pg.query('SELECT 1');
    // Normalize PGlite's result shape to node-pg's { rows, rowCount }.
    impl = {
      kind: 'pglite',
      query: async (text, params = []) => {
        const r = await pg.query(text, params);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      },
      pg,
    };
    console.log('[db] using embedded PGlite at', DATA_DIR);
  }
  return impl;
}

export async function query(text, params) {
  const d = await getDb();
  return d.query(text, params);
}

export const hasDbUrl = () => !!dbUrl();
export const hasAnyDbEnv = () => RAW_URLS().length > 0;
