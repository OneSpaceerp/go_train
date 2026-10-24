# Go Train

A training PWA for coaches and athletes — a Go Train build of the Train Track
feature set. Installable, works offline, phone-first.

- **Frontend:** Vue 3 + Vite + Tailwind, installable PWA (service worker, manifest,
  maskable icons). Design mirrors the Nest App design system, re-skinned to Go
  Train's coral.
- **Backend:** Node + Express API over **PostgreSQL**. No database install needed in
  dev — the API falls back to **PGlite** (Postgres compiled to WASM, persisted to
  `server/.pgdata`). Point `DATABASE_URL` at a real Postgres server and the same
  schema and queries run unchanged.

## Run it

Two processes. From `C:\dev\go_train`:

```bash
cd server && npm install && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5180. The frontend proxies `/api` to the API on :4000.

**Demo accounts** (password `gotrain`):
- Athlete — `heba@gotrain.app`
- Coach — `coach@gotrain.app`

First API start creates the schema and seeds sample data (programs and workout
history transcribed from the Train Track screenshots, plus an Arabic comment to
exercise RTL). Re-seed any time with `cd server && npm run db:reset`.

## Use a real PostgreSQL server

Dev uses PGlite automatically. To use Postgres instead:

```bash
docker compose up -d
```

Then in `server/.env` set `DATABASE_URL=postgres://gotrain:gotrain@localhost:5432/gotrain`,
run `cd server && npm run db:reset`, and `npm run dev`. The API logs which backend
it connected to on start.

## What's built (everything, thin)

Athlete: Train home (**month calendar** with status dots + tap-a-day, program,
today's workout), Track (completion ring + progress charts), Messages, Profile,
**History search** (server-side, highlighted, date sections, Arabic-aware),
Programs, **Workout detail** (find-in-workout, rich logging — result, RPE, a
built-in stopwatch, file attachments, and previous results), Notifications,
Exercise library, Marketplace, Gym/Team, Promos.

Coach: Clients, Programs (create), Messages, Profile — role chosen at login,
different tab bar.

Most screens are a working vertical slice rather than a finished feature; the
database schema (`server/db/schema.sql`) covers every area, so screens can be
deepened without schema changes.

## Layout

```
server/                Express API + PostgreSQL
  db/schema.sql        the database — all Train Track domains
  src/initdb.js        schema loader + seed (from the screenshots)
  src/index.js         API routes (auth, programs, workouts, history, messaging,
                       tracking, insights, coach, gym, marketplace, promos)
  src/db.js            pg || PGlite
frontend/              Vue 3 PWA
  src/views/           one file per screen
  src/components/      Scaffold, BottomNav, AppHeader, Avatar, Icon, …
  src/lib/             api, session, search (highlight/grouping), format
docker-compose.yml     optional real Postgres
```

## Notes

- `server/.pgdata/` (PGlite data) and `node_modules/` are local; don't commit them.
- JWT auth with a dev secret in `server/.env` — change `JWT_SECRET` before any real use.
- This is a standalone build; it does not connect to Train Track's servers.
