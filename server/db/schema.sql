-- Go Train — PostgreSQL schema
-- Covers every Train Track domain found in the reverse-engineering report:
-- accounts/roles, coach↔client, programs & workouts, logs, exercise library,
-- messaging, notifications, progress tracking & insights, gym teams & roles,
-- marketplace, promos, subscriptions.
--
-- Runs on PGlite (dev, zero-install) and on a real Postgres server unchanged.
-- Enum-like columns use CHECK constraints instead of CREATE TYPE so the same
-- file re-runs cleanly on PGlite.

-- gen_random_uuid() is built into Postgres 13+ and PGlite core — no extension needed.
-- On Postgres 12 or older, uncomment: CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Accounts & roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client','coach','admin')),
  avatar_url    TEXT,
  phone         TEXT,
  locale        TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ar')),
  theme         TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  bio           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A coach has one coach profile; a client has one client profile.
CREATE TABLE IF NOT EXISTS coach_profiles (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline   TEXT,
  specialty  TEXT,
  gym_name   TEXT,
  verified   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS client_profiles (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  goal           TEXT,
  height_cm      NUMERIC(5,1),
  weight_kg      NUMERIC(5,1),
  date_of_birth  DATE
);

-- Coach↔client relationship (a client can be coached by one coach at a time here).
CREATE TABLE IF NOT EXISTS coach_clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

-- ---------------------------------------------------------------------------
-- Gym teams & roles (the gym/team tier)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gym_teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gym_roles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES gym_teams(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  -- coarse permissions as JSON so the thin UI can show them without more tables
  can_manage_clients  BOOLEAN NOT NULL DEFAULT false,
  can_manage_programs BOOLEAN NOT NULL DEFAULT false,
  can_manage_billing  BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS gym_members (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id  UUID NOT NULL REFERENCES gym_teams(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id  UUID REFERENCES gym_roles(id) ON DELETE SET NULL,
  is_paying_client BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS join_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES gym_teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Exercise / movement library
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT,                       -- Strength, Engine, WOD, Core, Run…
  video_url   TEXT,
  thumbnail_url TEXT,
  description TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Programs & workouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'ongoing'
                CHECK (kind IN ('ongoing','standard','template')),
  owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,   -- the coach
  team_id     UUID REFERENCES gym_teams(id) ON DELETE SET NULL,
  description TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,                -- marketplace/visibility
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A program assigned to a client (an "ongoing program" for that athlete).
CREATE TABLE IF NOT EXISTS client_programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (program_id, client_id)
);

-- A workout = one training day inside a program (the "Day 1" cards).
CREATE TABLE IF NOT EXISTS workouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id   UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,            -- "Day 1", "RUN", "Strength"
  letter       TEXT,                     -- "A", "B" badge
  scheduled_on DATE,
  position     INTEGER NOT NULL DEFAULT 0,
  body         TEXT NOT NULL DEFAULT '', -- the coach's workout text (Strength/Engine/WOD…)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A client's log against a workout (their result + optional attachment).
CREATE TABLE IF NOT EXISTS workout_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id  UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('done','missed')),
  result      TEXT,                      -- "heba 3 kilometers\nnada 3.07 kilometers"
  details     TEXT,
  attachment_url TEXT,
  logged_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments on a workout (coach/client thread under a training day).
CREATE TABLE IF NOT EXISTS workout_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id  UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Messaging (coach ↔ client threads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'info',   -- workout, message, promo, system
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Progress tracking & insights
-- ---------------------------------------------------------------------------
-- A tracked metric point (bodyweight, a lift PR, a benchmark time…).
CREATE TABLE IF NOT EXISTS tracking_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric      TEXT NOT NULL,            -- "Back Squat 1RM", "Bodyweight", "5k"
  unit        TEXT NOT NULL DEFAULT 'kg',
  value       NUMERIC(10,2) NOT NULL,
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Marketplace
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  seller_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  summary     TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'USD',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  buyer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Promos & subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  percent_off INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  expires_on  DATE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','gym')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','trialing','canceled')),
  renews_on   DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes that the thin UI's list/search screens lean on
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workouts_program   ON workouts(program_id, position);
CREATE INDEX IF NOT EXISTS idx_logs_client        ON workout_logs(client_id, logged_on DESC);
CREATE INDEX IF NOT EXISTS idx_logs_workout       ON workout_logs(workout_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread    ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifs_user        ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_client    ON tracking_entries(client_id, metric, recorded_on);
CREATE INDEX IF NOT EXISTS idx_client_programs    ON client_programs(client_id, is_active);

-- ---------------------------------------------------------------------------
-- Migrations (idempotent) — columns added after the first release.
-- ADD COLUMN IF NOT EXISTS works on Postgres 9.6+ and PGlite.
-- ---------------------------------------------------------------------------
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS rpe INTEGER;              -- rate of perceived exertion 1–10
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS duration_seconds INTEGER; -- time from the built-in stopwatch
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS attachment_name TEXT;     -- original filename of the attachment
