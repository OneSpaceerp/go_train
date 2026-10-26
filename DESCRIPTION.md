# Go Train — Full Product Description

**Go Train** is a multi-sport fitness-space management platform built as a custom
**Frappe/ERPNext v16** application by **nsdLabs** (a brand under Nest Software
Development). It is one app with two faces:

- a **Desk application** (staff/management) with the new ERPNext v16 two-sidebar
  shell, and
- an installable **athlete PWA** served at `/gotrain`.

Both run from a single Frappe app (`go_train`) and share one database, one
permission model, and ERPNext's accounting, CRM and HR underneath.

- **Publisher:** nsdLabs · info@nsd-eg.com
- **Platform:** Frappe 16.5x / ERPNext 16.51+
- **App module:** Go Train
- **Repository:** OneSpaceerp/go_train (the repo root *is* the Frappe app)
- **Sports supported:** Gym, CrossFit, Calisthenics, Weightlifting, HYROX, Boxing,
  Yoga, Running — and any discipline an admin adds.

Each section below marks status: **Live** (built and installed), **Scaffolded**
(UI/structure present, backend arrives in a later phase), or **Next phase**.

---

## 1. Architecture

```
ERPNext v16 bench
└── go_train  (one Frappe app)
    ├── Desk app  ──►  /app/go-train      two-sidebar management UI (staff)
    ├── PWA       ──►  /gotrain           Vue 3 SPA (athletes), installable
    ├── REST API  ──►  /api/method/go_train.api.pwa.*   (the PWA's data layer)
    └── DocTypes + roles + workspace + settings  (shared backend)
```

- **One codebase, two front doors.** The Desk app is for gym managers, coaches
  and front desk; the PWA is for members. They read and write the same DocTypes.
- **The PWA** is a Vue 3 + Vite single-page app, built into the app's
  `public/frontend/` and served by a Jinja bootloader (`www/gotrain.py|html`).
  It authenticates with the Frappe session (cookie + CSRF) and talks only to the
  app's own whitelisted API, which scopes every call to the signed-in member.
- **Reuse over reinvention.** Go Train reuses ERPNext where it already solves the
  problem — Customer, Employee, Subscription, Sales Invoice, Branch/Location,
  Asset, Coupon Code — and adds fitness-specific DocTypes on top.

---

## 2. The ERPNext (Desk) application

### 2.1 App shell — the v16 two-sidebar view **[Live]**

Go Train ships the new ERPNext v16 app experience:

- **Launcher tile** on the `/apps` screen (coral dumbbell logo) → opens the Go
  Train Desk workspace.
- **Narrow icon dock rail** (far left) with a dual-tone dumbbell module icon.
- **Grouped Workspace Sidebar** with a lucide icon per entry:
  - **Home** (workspace) · **Open Athlete App** (→ `/gotrain`)
  - **Training:** Sport, Exercise, Training Program, Workout, Member Program
  - **Members:** Member, Coach, Progress Entry
  - **Classes:** Class Type, Class Session, Class Booking
  - **Attendance & Logs:** Check In, Workout Log
  - **Configuration:** Go Train Settings
- **Workspace landing** with shortcut cards (Members, Workout Logs, Programs,
  Class Sessions) and the grouped links above.

### 2.2 Domain model — DocTypes **[Live]**

**Catalog & people**

| DocType | Purpose | Key fields |
|---|---|---|
| **Sport** | A discipline (Gym, CrossFit, …) | name, active, icon, description |
| **Exercise** | Movement library | name, sport, category (Strength/Engine/WOD/Core/Skill/Mobility), muscle, equipment, video, thumbnail, description |
| **Coach** | A trainer | name, user, employee, sport, phone, bio, active |
| **Member** | An athlete | name (series GTM-), status (Active/Paused/Ended), user account, customer, coach, primary sport, phone, email, gender, DOB, joined on, goal, height, weight, language, notes |

**Programming**

| DocType | Purpose | Key fields |
|---|---|---|
| **Training Program** | A coach-built block | name, sport, coach, kind (Ongoing/Standard/Template), published, active, description |
| **Member Program** | Assigns a program to a member | member, program, start date, active |
| **Workout** | A training day in a program | title, program, letter, day index, scheduled date, summary, body (free text), **Workout Exercise** rows |
| **Workout Exercise** (child) | A prescribed movement | exercise, label, sets, reps, tempo, target load, rest, notes |

**Logging & progress**

| DocType | Purpose | Key fields |
|---|---|---|
| **Workout Log** | A member's result | member, workout, program, date, status (Done/Missed), result, RPE, duration, attachment, details, **Workout Set Log** rows |
| **Workout Set Log** (child) | A logged set | exercise, set no, weight, reps, done, note |
| **Progress Entry** | A tracked metric point | member, metric, value, unit, recorded on, notes |

**Classes & attendance**

| DocType | Purpose | Key fields |
|---|---|---|
| **Class Type** | A recurring class | name, sport, default coach, capacity, duration, active, description |
| **Class Session** | A scheduled instance | class type, coach, facility, status (Scheduled/Completed/Cancelled), start, end, capacity |
| **Class Booking** | A member's spot | session, member, status (Booked/Attended/Cancelled/Waitlist), booked on |
| **Check In** | Attendance event | member, time, method (Front Desk/QR/App/Manual), facility, session |

**Configuration**

| DocType | Purpose |
|---|---|
| **Go Train Settings** (single) | Brand colour, gym/space name, timezone, default sport, support WhatsApp, and PWA toggles: members can book classes, members can self check-in, show progress charts, welcome message |

### 2.3 Roles & permissions **[Live]**

Created automatically on install:

- **Gym Manager** — full access to every Go Train DocType; runs the facility.
- **Coach** — create/edit exercises, programs, workouts, classes; read members
  and logs.
- **Front Desk** — check-ins and bookings; read members.
- **Member** — no Desk access; uses the PWA only. Permissions are enforced in the
  PWA API, which scopes every read/write to the signed-in member.

Permissions live in each DocType's JSON (metadata-first), so they are versioned
and upgrade-safe. Nothing in `frappe/` or `erpnext/` is modified.

### 2.4 Starter data **[Live]**

On install, `after_install` creates the four roles and seeds eight sports (Gym,
CrossFit, Calisthenics, Weightlifting, HYROX, Boxing, Yoga, Running). It is
idempotent and re-runs on every migrate.

---

## 3. The athlete PWA (`/gotrain`)

A phone-native, installable Progressive Web App for members. Vue 3 + Vite +
Tailwind, coral Go Train design language, light/dark following the system,
RTL-ready (English/Arabic).

### 3.1 Shell & platform **[Live]**

- **Installable** (web app manifest, maskable icons, service worker) — "Install"
  to the home screen on Android/iOS/desktop.
- **Animated launch splash** rendered before the app bundle loads: a dot grid and
  faint rings gather, the logo rises into focus, a line of light traces around it
  and a sheen sweeps across, the name slides up, a scanning loader bar runs —
  "FROM nsdLabs" at the foot. Fully disabled under reduced-motion.
- **Dedicated branded login screen** — signs in against the Frappe session
  (`/api/method/login`); no bounce to the Desk login.
- **Bottom tab bar:** Train · Track · Messages · Profile. One bottom sheet at a
  time, safe-area aware, keyboard-aware.
- **Offline-tolerant:** the API is cached network-first, so the last-known data
  shows when offline.

### 3.2 Screens & features

**Train (home)** **[Live]**
- Welcome header with the member's name, notifications and history shortcuts.
- **Month calendar** with a status dot on every scheduled day (green = done,
  red = missed, coral = scheduled); month navigation; tap a day to filter to its
  workouts.
- **Active program** card.
- **Today's workouts:** expandable cards showing the coach's workout text, with a
  **Log** button and a status pill once logged.

**Workout detail** **[Live]**
- Full workout text and prescribed exercises.
- **Find-in-workout:** a search box that highlights matches in the body and
  comments with a live "n of m" counter and up/down navigation (Arabic-aware).
- **Rich logging:** result text, notes, an **RPE 1–10** selector, a **built-in
  stopwatch** that drops elapsed time into the log as a duration, and **file
  attachments** (photos/video/PDF).
- **Previous results:** every prior log for that workout, newest first.

**History (search)** **[Live]**
- One search field over the member's logged workouts — matches title, the coach's
  text, the logged result, and the program name.
- **Highlighted matches**, results grouped into Notes-style date sections
  (Today / Previous 7 Days / Previous 30 Days / month), status pills and a
  one-line snippet per hit. Case-, accent- and Arabic-aware.

**Track** **[Live]**
- **Insights:** a completion ring (done vs missed) and counts (done, missed, days
  logged).
- **Progress charts:** a line chart per tracked metric (e.g. Back Squat 1RM,
  bodyweight, 5k), with the latest value and date range.

**Programs & program detail** **[Live]**
- The member's enrolled programs with a progress bar (done/total workouts), and a
  per-program list of workouts with status.

**Profile** **[Live]**
- Member card, language toggle (English/العربية), light/system/dark theme, and
  links to the other areas. Logout.

**Messages / Thread** **[Scaffolded]** — the UI is built; the messaging backend
(coach↔member threads, realtime) is a next-phase module, so it currently shows an
empty state.

**Notifications, Exercise library, Marketplace, Gym/Team, Promos, Coach views**
**[Scaffolded]** — screens exist and are wired to the API; their ERPNext backends
arrive in later phases, so they show empty states today rather than errors.

### 3.3 The PWA data layer **[Live]**

The PWA talks to the backend through member-scoped whitelisted methods in
`go_train/api/pwa.py`:

| Method | Does |
|---|---|
| `boot` / `get_profile` | Who's signed in + their member profile |
| `get_programs` | The member's programs with progress counts |
| `get_program_workouts` | Workouts in a program, with the member's log |
| `get_workout` / `log_workout` | A workout + its logs / save a log |
| `get_history` | Searchable workout-log history |
| `get_insights` | Completion ring + counts |
| `get_tracking` | Progress metrics as time series |
| `get_classes` / `book_class` | Upcoming class sessions / book a spot |
| `check_in` | Self check-in |
| `check_app_permission` | Gate the launcher tile |

Every read is scoped to the signed-in member; an admin or unlinked user sees
empty data rather than an error. Writes require a linked member.

---

## 4. How a gym uses it today

1. **Set up** sports, the exercise library, coaches, and class types in Desk.
2. **Add members** and link each to a Frappe **User** (so they can sign into the
   PWA).
3. **Build programs** (coach) and assign them to members (**Member Program**);
   add **Workouts** with prescribed exercises.
4. **Schedule classes** (**Class Session**) from class types.
5. **Members** open `/gotrain`, see their program and today's workout, **log**
   results (sets, RPE, duration, photos), search their **history**, track
   **progress**, and (next phase) book classes and check in.
6. **Staff** review workout logs, attendance and progress in Desk, alongside
   ERPNext billing/CRM/HR.

---

## 5. Next phase and roadmap

The training core and the single-app PWA structure are shipped. Planned next,
roughly in order:

### Phase 2 — Membership & billing **[Next phase]**
- **Membership Plan** (tied to an ERPNext Item / Subscription Plan) and
  **Membership** (a member's active plan).
- Automated billing via **ERPNext Subscription** and **Sales Invoice**; payment
  capture; **Coupon Code** promos surfaced in the PWA Promos screen.
- Plan status drives PWA access (active / past-due / expired).

### Phase 3 — Facilities, equipment & front desk **[Next phase]**
- **Branch/Location** as facilities and training areas; **Asset** for equipment
  (with maintenance).
- **Front-desk POS:** walk-ins, day passes, quick check-in by QR, drop-in sales.
- Class capacity, waitlists and attendance tied to check-ins.

### Phase 4 — Messaging, notifications & realtime **[Next phase]**
- Coach↔member **threads** (the Messages screen) backed by real DocTypes.
- **Push notifications** (FCM/web-push) for new workouts, class reminders,
  messages and promos; Frappe realtime for live updates.

### Phase 5 — Coach tooling & marketplace **[Next phase]**
- A richer **program builder** in Desk/PWA; templates and bulk assignment.
- **Marketplace:** coaches publish and sell programs (the Marketplace screen);
  purchases and sales via ERPNext invoicing.

### Phase 6 — Insights, community & integrations **[Next phase]**
- **Reports & dashboards:** attendance, retention, revenue, member progress.
- **Leaderboards & challenges** (community features).
- **Nutrition** plans and tracking; **wearables / health** integrations
  (steps, heart rate, workouts).
- **Multi-branch / gym teams** with roles across locations.

### Cross-cutting
- Full **Arabic** localization across Desk and PWA (RTL already supported).
- **Member self-service portal**, QR membership cards.
- Hardening: tests, CI, performance, and a public API for third-party integrations.

---

## 6. Technical summary

- **Frappe app** at the repo root (`pyproject.toml` flit build), module **Go
  Train**, upgrade-safe (no core edits), metadata-first DocTypes.
- **PWA**: Vue 3 + Vite + Tailwind, built into `go_train/public/frontend/`,
  served by `www/gotrain.py|html`, routed under `/gotrain` via
  `website_route_rules`.
- **Two-sidebar v16 UI**: `Workspace Sidebar` + `Dock` + `Desktop Icon` +
  `add_to_apps_screen`, with a dual-tone dumbbell icon sprite.
- **Install:** `bench get-app https://github.com/OneSpaceerp/go_train` →
  `install-app` → `migrate` → `bench build`.

For the design system see `DESIGN.md`; for scope see `PRODUCT.md`; for install and
layout see `README.md`.
