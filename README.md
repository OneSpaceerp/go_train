# Go Train

<p align="center">
  <img src="go_train/public/images/go_train_logo.png" alt="Go Train" width="96" height="96" />
</p>

**Go Train** is a gym, coaching, workout programming, and athlete progress-tracking app built natively on **Frappe / ERPNext v16.51+**, paired with an installable mobile-first **Athlete & Coach PWA** served at `/gotrain`.

---

## Architecture & ERPNext v16.51+ Integration

- **Desk App Home & Icons (`/desk/go-train`)**:
  - `app_home = "/desk/go-train"` with role-gated `/apps` screen tile (`go_train.api.pwa.check_app_permission`).
  - Animated SVG icon sprite ([module-icons.svg](go_train/public/icons/module-icons.svg)) providing `#icon-go-train-duotone`, `#icon-go-train-soft`, `#icon-go-train-setup-duotone`, and `#icon-go-train-setup-soft`.
  - **Dock & Dual Sidebars**: `Go Train` and `Go Train Setup` dock entries with matching `Workspace Sidebar` and `Sidebar` records for full Frappe v16.51+ compatibility.
  - **Workspace Dashboard**: Real-time `Daily Check-ins` chart, `Check-ins Today`, `Workouts Logged This Month`, and `Active Members` number cards, plus quick-launch shortcuts.
- **16 Native DocTypes**:
  - **Athletes & Coaching**: `Member`, `Coach`, `Progress Entry`
  - **Programming & Logging**: `Sport`, `Exercise`, `Training Program`, `Member Program`, `Workout`, `Workout Exercise`, `Workout Log`, `Workout Set Log`
  - **Classes & Floor Operations**: `Class Type`, `Class Session`, `Class Booking`, `Check In`
  - **Configuration**: `Go Train Settings`
- **Athlete & Coach PWA (`/gotrain`)**:
  - Vue 3 + Vite + Tailwind CSS SPA with a choreographed ~3.4s multi-stage athletic launch splash screen (aurora glow, concentric cadence rings, SVG perimeter light trace, sheen sweep, and 4-stage live status ticker in English & Arabic RTL).
  - Dedicated Service Worker endpoint (`/api/method/go_train.api.pwa.sw`) with `Service-Worker-Allowed: /gotrain`.
  - Full feature coverage: Month Calendar with workout status dots, Workout Logger with Stopwatch & File Attachments, Workout Comments, PR & Metric Tracker (`Track`), Group Class Booking & Floor Self Check-in (`Classes`), Direct Coach↔Athlete Messaging (`Messages`), Notifications, Exercise Library, Program Marketplace, Promos, Gym Roster, and Coach Mode (client management, program creation, and workout builder).

---

## Installation

From your Frappe v16 bench:

```bash
bench get-app https://github.com/ksr2020/Go_Train.git
bench --site <your-site> install-app go_train
bench --site <your-site> migrate
```

On install and migrate, Go Train automatically creates the gym roles (`Gym Manager`, `Coach`, `Front Desk`, `Member`) and seeds starter `Sport`, `Exercise`, and `Class Type` records. When ERPNext/HRMS provides the `Employee` DocType, an optional `Employee` link is added to `Coach`.

### Access rules

- **Athletes** (`Member` role) only see their own Member profile, workout logs, progress entries, bookings, check-ins and enrollments — in the PWA and through `/api/resource`. They see published programs plus the programs they're enrolled in.
- **Coaches** need an active `Coach` record linked to their user. They manage only their own clients (`Member.coach`) and their own programs.
- **Gym Managers** manage all members and programs.
- Staff users never get a Member record created automatically. To train as an athlete too, link a Member to their user in Desk.

### Paid programs & promos

- Enrolling in a free program activates it immediately. A paid program creates a `Member Program` with **Payment Status = Pending** (inactive). Once payment is taken, set it to **Paid** and tick **Active**.
- Member perks are managed as **Gym Promo** records (Go Train Setup → Gym Promos).

---

## Developing the PWA

```bash
npm run dev      # Vite dev server
npm run build    # Builds into go_train/public/frontend/ and updates go_train/www/gotrain.html
cd frontend && npm test   # Vitest unit tests (offline queue, API layer, search)
```

Offline behaviour: the service worker caches the `/gotrain` app shell, so the installed app opens without a network. Workout logs, progress entries and check-ins made offline are queued with the device time, and are replayed with idempotency keys when the device is back online.

The build also writes `manifest.json` at the repo root: a copy of the real manifest, for tools such as PWABuilder Studio that look for one there. Don't edit it; change `frontend/vite.config.js` and rebuild.

## Android app (Google Play)

The Play Store app is a Trusted Web Activity: a thin Android shell around the live site at `https://<your-domain>/gotrain`, packaged with [PWABuilder](https://www.pwabuilder.com) (website or the PWABuilder Studio VS Code extension). The site must be live on HTTPS first.

1. Generate the packaging settings from the built manifest:

   ```bash
   cd frontend
   npm run android-settings -- https://<your-domain> com.gotrain.app 1.0.0 1
   ```

   This writes `android-settings.json` (git-ignored) with the icons, colours, shortcuts and start URL. The package ID can never change once the app is on Play.
2. Package: in PWABuilder Studio choose **Package → Android**, enter `https://<your-domain>` and `https://<your-domain>/assets/go_train/frontend/manifest.webmanifest`, answer **Yes** to advanced settings, and replace the file it opens with the contents of `android-settings.json`. On pwabuilder.com, enter the site URL and copy the same values into the Android options.
3. Keep the downloaded `signing.keystore` and `signing-key-info.txt` somewhere safe (not in git). Every future update must be signed with this key.
4. In Desk, open **Go Train Settings → Android App** and enter the package ID and the SHA-256 fingerprint from the package's `assetlinks.json`. Go Train then serves `https://<your-domain>/.well-known/assetlinks.json`; without it, the app shows a browser address bar.
5. After uploading to Google Play, add Play's app signing key fingerprint (Play Console → Setup → App signing) as a second line in the same field.
6. For each update, bump the version code (`... 1.0.1 2`) and repackage with the same keystore (`signingMode: "mine"`).

## Tests

```bash
bench --site <your-site> set-config allow_tests true
bench --site <your-site> run-tests --app go_train
```

CI (`.github/workflows/ci.yml`) runs ruff, the PWA tests and build, and the Frappe integration tests.

---

## License

MIT
