---
name: Go Train
description: Multi-sport fitness-space management on ERPNext v16, with a phone-native athlete PWA
colors:
  sunshine: "#FED14F"
  sunshine-press: "#F2BE22"
  on-sunshine: "#32373B"
  amber-ink: "#875E00"
  sunshine-wash: "#FFF6D6"
  charcoal: "#32373B"
  ink: "#1F2326"
  muted-ink: "#5B6166"
  paper: "#FFFFFF"
  cloud-page: "#F1F1F1"
  hairline: "#DDDEDF"
  night-page: "#1B1E20"
  status-done: "#127554"
  status-missed: "#C41E32"
typography:
  body: "system-ui, -apple-system, Segoe UI, Roboto, Cairo, sans-serif"
  display: "Poppins, Cairo, system-ui, sans-serif"
rounded:
  field: "0.875rem"
  card: "1.5rem"
  sheet: "2rem"
  pill: "9999px"
---

# Design System: Go Train

## North star

The Go Train PWA should feel like one of the phone's own apps, not a web page on
top of ERPNext — the same calm, phone-first language as the Nest App, in Go Train's
Sunshine yellow. Desk keeps ERPNext's native look; the PWA is where the
design system lives.

## Colors

Every colour comes from the logo (`go_train/public/images/go_train_logo.svg`):
**Sunshine** yellow, **Charcoal** and **Cloud** off-white. A quiet cloud-and-paper
world with **one** confident action colour, Sunshine.

- **Sunshine** (#FED14F): fills primary buttons, the selected tab, the selected
  day and RPE, and progress. *If it's yellow, you can tap it.* Pressed: #F2BE22.
- **On Sunshine** is Charcoal (#32373B): the only text colour on yellow (8.3:1).
  **White never sits on yellow** (1.45:1).
- **Amber Ink** (#875E00): accent text and icons on light surfaces, such as
  back buttons, Cancel/Done, links and section accents (5.8:1 on white). In dark
  mode accent text is Sunshine itself (11.5:1 on the dark page).
- **Sunshine Wash** (#FFF6D6 light / #464231 dark): soft buttons, chips and
  selected rows, with Amber Ink text.
- **Ink** (#1F2326): titles, values and names. **Charcoal** (#32373B) and
  **Muted Ink** (#5B6166, 5.6:1 on the page): secondary text. Neutrals are warm
  greys from the logo, never blue-tinted.
- **Cloud Page** (#F1F1F1) behind white cards; **Hairline** for dividers.
- **Dark mode** is built on the logo charcoal: page #1B1E20, cards #25292C,
  controls #32373B, text Cloud #F1F1F1.
- **Status:** Done is green (#127554) and Missed is red (#C41E32). Red is
  reserved for missed, failed and destructive actions only.

Tokens live in `frontend/src/style.css` (`--accent`, `--on-accent`,
`--accent-ink`, `--accent-soft`) and in Tailwind as `bg-accent`,
`text-accent-on`, `text-accent-ink` and `bg-accent-soft`.

## Logo & icons

The logo is a Charcoal-and-Cloud bike on a Sunshine tile (43/250 corner radius).
The vector master `go_train_logo.svg` and the glyph-only `go_train_glyph.svg`
are traced from the artwork; `npm run icons` renders every app icon from them:
the any/maskable manifest icons, the monochrome icon (a white silhouette of the
glyph), the apple-touch-icon and the favicon. The Desk sprite
(`public/icons/module-icons.svg`) and the launch screen use a simplified trace
of the same glyph.

## Typography

Body and controls use the **system font** (SF on Apple, Roboto on Android): it
is instant, works offline and matches the OS. **Poppins** is the display face
(Cairo in Arabic) for large titles and headline numbers. Sizes in rem; inputs
never below 16px so iOS doesn't zoom. Arabic mirrors fully (RTL, 1.6 line-height).

## Shape & depth

Capsule buttons and pills (fully rounded); primary buttons are Sunshine with dark labels, 24px cards, 14px fields, 32px sheet
tops. Soft, wide, warm-grey shadows — never black in light mode. Light is the
reference; dark follows the system (no in-app switch).

## Layout

A single phone-width column on a mist page; white cards; one bottom sheet at a
time. Safe-area insets honoured; the tab bar slides away with the keyboard.

## Navigation

- **Tab bar:** a floating Liquid Glass capsule. Athletes get Train · Classes ·
  Track · Messages · Profile; coaches get Clients · Programs · Messages · Profile.
  A Sunshine lens slides to the active tab, whose icon fills and turns dark. At ≥ 840px
  it becomes a left navigation rail. It stays visible on pushed screens and
  hides only for focused flows (chat) and sheets.
- **Stacks per tab** (`lib/nav.js`): each tab remembers its own screen.
  - Tapping another tab returns to where you left it.
  - Tapping the active tab pops to its root, then scrolls to top.
  - Tab roots stay mounted (`KeepAlive`) and refresh quietly when shown again.
- **Bars:** tab roots show an iOS large title that collapses into the bar on
  scroll. Pushed screens get a compact title and a back button naming the
  previous screen (iOS) or an arrow (Android). Bars are transparent at the top
  and turn to glass once content scrolls under them.
- **Gestures** (`components/Scaffold.vue`):
  - Edge-swipe back follows the finger and commits on distance or a flick.
  - Swiping across a tab root moves to the neighbouring tab. It's a shortcut
    to the tab bar, never started at screen edges, in horizontal scrollers or
    in form fields.
  - Pull-to-refresh on feeds.
  - Sheets drag down to dismiss.
  - Back (gesture, Android button, Esc) always closes the top layer first.

## Motion

Screen changes run through the View Transitions API (`router.js` + `style.css`):

- **Push:** the new screen slides in over the old one, which parallaxes back 28%.
- **Pop:** the reverse.
- **Tab tap:** a quick fade-through.
- **Tab swipe:** pager movement in the finger's direction.

The tab bar never moves, and the navigation bar crossfades. Timing is 340ms on
Apple's curve `cubic-bezier(0.32, 0.72, 0, 1)`. Only transform and opacity
animate. Reduced motion turns every transition into a cut. Browsers without
View Transitions also get a cut.

## Launch

The PWA opens on a full Sunshine launch screen (`frontend/index.html`, inline so
it paints on the first frame). The manifest `background_color` is the same yellow,
so the phone's own launch screen hands over without a flash. The bike rides in
from the leading edge, the Charcoal wordmark and tagline settle, and a status
line and Charcoal progress bar run underneath. It lasts about 2.4s, then fades
into the app (`src/lib/splash.js`); reduced motion shows it static. No glows or
gradient text.

## Named rules

- **Tap means Sunshine.** Yellow only on things that respond to a tap; values are ink.
- **Dark on yellow.** Text on Sunshine is always On Sunshine, never white.
- **Red is final.** Missed/failed only — never "pending" or emphasis.
- **One column, one sheet, one primary action** per screen.
- **Back closes one layer.** A sheet, then the screen, then the tab's stack.
- **Thumb-sized controls.** Every tap target is at least 44pt, and button labels never wrap.
- **Two actions in the bar.** A navigation bar holds at most two actions; the rest go in a "⋯" action sheet.
- **Focused tasks get an action bar.** Logging a workout or chatting hides the tab bar; the primary action sits in a sticky bottom bar.
- **Gestures have a button too.** Swipe-to-delete on a set is matched by the set-number menu.

## Movement media

Each movement can carry media in two places:

- **Coach demo:** a photo, a video or a YouTube link on the workout's movement, added in the coach movement editor. Athletes tap the thumbnail to play it in place (YouTube runs through the privacy-enhanced player).
- **Athlete form check:** a photo, a video or a YouTube link per movement on the athlete's log, so the coach can review technique.

Uploads are private files attached to the Workout (demo) or the Workout Log (form check), so only people who can see that record can open them.
