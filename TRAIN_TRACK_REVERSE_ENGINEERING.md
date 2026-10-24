# Train Track — reverse-engineering report

Investigation of the Train Track product across its website, web app, Android and iOS
listings, using REA (Reverse Engineer Anything) on the shipped web build plus public
sources. Every claim is tagged **[observed]** (seen directly in a shipped artifact or an
official page), **[inferred]** (reasoned from evidence) or **[unknown]**.

Captured 2026-10-24. Artifacts analysed are the ones served that day; the apps update often,
so versions below are a snapshot.

## 1. What Train Track is

A SaaS platform for fitness coaches to build and track training programs for their clients,
with messaging, progress tracking and a gym/team tier. **[observed]**

- Website: <https://traintrackcoach.com/> (marketing, WordPress)
- Web app: <https://app.traintrackcoach.com/> (the actual product)
- Coach dashboard: <https://dashboard.traintrackcoach.com/> **[observed, referenced in bundle]**
- API: `https://api.traintrackcoach.com/api/` **[observed]**
- Android: `com.ar.train_track` — developer **AR Development Solutions** **[observed]**
- iOS/macOS: `id6478457740` — seller **Ahmed Rashad** **[observed]**
- Contact: info@traintrackcoach.com, tel +20 1100083111, YouTube @TraintrackCoach **[observed]**

"AR Development Solutions" / "Ahmed Rashad" are consistent across the two stores, so the app
is one small developer/studio. **[inferred]**

## 2. How the evidence was gathered

| Artifact | Method | Identity |
|---|---|---|
| `traintrackcoach.com` HTML | `curl` | LiteSpeed + PHP 8.2.34, WordPress (Astra theme, Elementor, WPForms) **[observed]** |
| `app.traintrackcoach.com` shell | `curl` | Flutter web app; served by Hostinger `hcdn` **[observed]** |
| `main.dart.js` | `curl` + REA | sha256 `77052a91…74a71a7`, 10.66 MB, Flutter/Dart compiled to JS **[observed]** |
| Web build tree | `rea-agents@6.7.0 analyze-javascript-application` | evidence `ev_b64f8df1…4443`; graph `jag_8480748c…3ff4` **[observed]** |
| Play Store | browser pane | AR Development Solutions **[observed]** |
| App Store | WebFetch | Ahmed Rashad **[observed]** |

**REA coverage limitation [observed].** REA parsed the HTML, bootstrap and service-worker JS
and built a semantic graph (2,953 nodes, 108 function fingerprints). It could **not** fully
analyse `main.dart.js`: *"Owned JavaScript worker exhausted its heap while analyzing
main.dart.js during static"* analysis (heap limit ~1.03 GB). So deep call-graph facts for the
Dart code are **[unknown]**; the Dart findings below come from string/URL/route extraction over
the bundle, which is observation of inert text, not execution.

## 3. Technology stack

### Front end — the app **[observed]**
- **Flutter** (Dart compiled to `main.dart.js`), rendered with **CanvasKit**
  (`gstatic.com/flutter-canvaskit/035316565a…`). Same Dart codebase ships to web, Android,
  iOS, macOS and Apple Watch.
- Version **5.4.1 build 78** on web (`version.json`); internal package name `train_track`.
- Embeds native views via `flutter_inappwebview`; toasts via `fluttertoast`; images via
  `cached_network_image`; HTTP via `dio` + `http`; push via `firebase_messaging` +
  `flutter_local_notifications`; `permission_handler`. **[observed, from NOTICES + bundle]**

### Identity / auth — **AWS Amplify + Cognito** **[observed]**
- Bundles `amplify_auth_cognito_dart` and `amplify_secure_storage_dart` (with web workers
  `workers.release.dart.js`).
- OAuth2 routes `/oauth2/authorize`, `/oauth2/token`; Cognito user-pool identifier
  **`eu-north-1_9tC3IAs2w`** is embedded (region **eu-north-1 / Stockholm**). This is a
  client-side identifier, not a secret, but it tells us the auth backend. **[observed]**

### Backend / data **[observed]**
- Custom REST API at `api.traintrackcoach.com/api/` (base URL hard-coded with a 60s timeout).
- **Firebase** project **`wod-connect`** (Realtime DB `wod-connect-default-rtdb.firebaseio.com`,
  Storage `wod-connect.appspot.com`, Analytics `G-672PJBLTE4`), config in the web `index.html`.
  "wod-connect" (WOD = CrossFit "workout of the day") is likely the project's original name.
  **[observed config; name origin inferred]**
- **S3** for media (`s3.amazonaws.com`, AWS SigV4 signing present → `/aws4_request`). **[observed]**
- CORS proxies referenced: `we-cors-anywhere.herokuapp.com`, `cors.bridged.cc`,
  `api.codetabs.com/v1/proxy`. **[observed]** — used to fetch cross-origin media (e.g. video).

### Marketing site **[observed]**
- WordPress on Hostinger (hPanel), LiteSpeed server + cache, Astra theme, Elementor 4.3.5,
  WPForms Lite, reCAPTCHA v3, Meta Pixel `518187191687465`. YouTube playlists embedded.

### Third-party media / integrations **[observed]**
- **YouTube** (iframe API, Data API v3) and **Vimeo** (`api.vimeo.com/videos/`) for exercise
  videos; WhatsApp deep links (`wa.me`). Several sample/demo API URLs are present
  (`jsonplaceholder`, `fakestoreapi`, `dummyapi.online`, USDA FoodData `api.nal.usda.gov`) —
  likely leftovers from tutorials/boilerplate, not core features. **[observed; role inferred]**

## 4. Feature map, from the API + route names **[observed]**

The bundle contains a full set of endpoint/route strings. They reveal the product's shape
(this is the structure, not proof any one runs a given way — **[observed strings]**):

**Auth & account:** `/login`, `/logout`, `/clientRegister`, `/coachRegister`, `/selectUserType`,
`/forgetPassword`, `/changePassword`, `/eligibility`, `/subscription`, `/config`

**Two roles — coach and client:**
- Coach: `/coach-clients`, `/coach-programs`, `/coach-profile`, `/coach-messages`,
  `/coach-promos`, `/coachClientsNotification`
- Client: `/clientPrograms`, `/clientProgramWorkouts`, `/clientProgramWorkoutsMonthView`,
  `/clientProgramLogs`, `/clientTrainWorkout`, `/clientProfile`, `/editClientProfile`,
  `/clientMessages`, `/clientNotifications`, `/clientInsights`, `/clientProgressTracking`,
  `/clientPromos`

**Programs:** `/standardProgram`, `/ongoingProgram/:ongoingProgramName`,
`/templateProgram/:templateProgramName` (and `gym*` variants)

**Gym / team tier:** `/gym/team`, `/gym/team/all-clients`, `/gym/team/payment-clients`,
`/gym/team/roles`, `/gym/team/roles/:roleId`, `/gymCoachClients`, `/gymCoachPrograms`,
`/gymClientPrograms`, `/gymCoachOptions`, `/joinRequests`, `/team`, `/coach-clients`

**Marketplace:** `/marketplacePurchases`, `/marketplaceSales`, `/unpublish` — coaches appear
to sell programs. **[observed strings; inferred purpose]**

**Workout screens:** `/exerciseLogScreen`, `/exerciseTimerScreen`, `/exerciseSharePreview`,
`/videoPlayerScreen`, `/previewImageScreen`, `/movements/video`, `/library`, `/tutorials`,
`/home`, `/notifications`, `/messages/thread`

This confirms, and goes beyond, your screenshots: the **History search** box you cloned sits
on top of `/clientProgramLogs` + `/clientProgramWorkouts`; "Message your coach" is
`/messages/thread`; the Program picker is the `*Program*` routes; the Track tab is
`/clientProgressTracking` + `/clientInsights`. **[inferred from route names + screenshots]**

A **marketplace** and a **gym/team tier with roles** exist in the code but weren't visible in
your screenshots — features beyond a single coach↔client view. **[observed]**

## 5. Store facts **[observed]**

| | Google Play | App Store |
|---|---|---|
| Name | Train Track | TrainTrack (Train Track App) |
| Developer | AR Development Solutions | Ahmed Rashad |
| Category | Health & Fitness | Health & Fitness |
| Price | Free | Free |
| Rating | 4.6 (10 reviews) | 5.0 (20 ratings) |
| Installs | 1K+ | — |
| Updated | Sep 12, 2026 | Sep 13 (v5.7) |
| Version | — | 5.7 (web build was 5.4.1) |
| Size | — | 129.9 MB |
| Age | Rated for 3+ | 18+ (chat + user content) |
| Platforms | Phone | iPhone, iPad, Mac (M1+), (watch per your link) |

**Play "Data safety" [observed]:** "No data shared with third parties" and "No data collected."
That declaration sits oddly beside the bundle, which clearly collects account data and ships a
**Meta Pixel** + **Firebase Analytics** on the web app and contact info per Apple's label. Worth
revisiting if accuracy matters. **[observed tension; not a proven violation]**

**Notable review [observed]:** a June 2026 Play review reports the app **crashing on every
exercise** and on resume. Matches the kind of state-restoration bug a Flutter workout screen
can have; untested here. **[observed report]**

## 6. Security / privacy notes (factual, non-exploit)

- **Cognito pool `eu-north-1_9tC3IAs2w`** and **Firebase web config** are visible in the
  shipped client. This is normal — both are designed to be public and must be paired with
  server-side rules — but anyone can read them. Confirm Firebase Realtime DB / Storage **rules**
  are locked down, since the RTDB URL is exposed. **[observed; recommendation]**
- Auth over AWS Cognito/Amplify with OAuth2 + secure-storage workers is a reasonable,
  standard choice. **[observed]**
- Third-party CORS proxies (`cors-anywhere`, `bridged.cc`, `codetabs`) in the request path for
  media are a reliability/privacy smell — traffic routed through them is visible to those
  third parties. **[observed; recommendation]**

## 7. Checklist status

| Question | Status |
|---|---|
| What is Train Track, who makes it | **answered** |
| Website stack | **answered** (WordPress/Hostinger) |
| App stack | **answered** (Flutter + Amplify/Cognito + Firebase + custom REST + S3) |
| Backend / API surface | **answered** (route/endpoint inventory) |
| Feature set | **answered** (coach/client, programs, gym teams, marketplace, messaging) |
| Store facts | **answered** (both stores) |
| Deep Dart call-graph / exact request shapes | **unresolved** — `main.dart.js` exceeded REA's analyzer heap; would need a higher-memory JS analysis pass or runtime capture to go deeper |

## 8. If you want to go further (with your authorization)

- **Runtime capture**: open the web app in the browser pane, sign in with a test account, and
  record network traffic to see exact request/response JSON per endpoint. Only against an
  account you own.
- **Android APK**: supply a legally obtained APK; REA's `inspect_android_package` (with your
  JADX) would give Dart/Kotlin manifest, permissions and the `libapp.so` Flutter snapshot.
- **Bigger JS pass**: re-run REA's JS analyzer on `main.dart.js` alone with a larger heap to
  recover more of the compiled-Dart graph.

All three need your explicit go-ahead and, for runtime, your own test credentials.
```
Evidence files (scratchpad, this session only):
  webapp/ (index.html, main.dart.js, version.json, manifest.json, AssetManifest, NOTICES)
  site/index.html
  rea-webapp.json  — full REA evidence record
```
