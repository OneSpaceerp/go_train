---
name: Go Train
description: Multi-sport fitness-space management on ERPNext v16, with a phone-native athlete PWA
colors:
  brand-coral: "#FB5A5F"
  brand-coral-deep: "#F23D46"
  brand-coral-press: "#D32731"
  brand-coral-wash: "#FFF0F1"
  midnight-ink: "#04002E"
  slate-ink: "#4B5A6E"
  muted-ink: "#707A8C"
  paper: "#FFFFFF"
  mist-page: "#F4F6FA"
  hairline: "#D7DDE6"
  status-done: "#17795A"
  status-missed: "#D12A41"
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
top of ERPNext — the same calm, phone-first language as the Nest App, re-skinned
to Go Train's coral. Desk keeps ERPNext's native look; the PWA is where the
design system lives.

## Colors

A quiet mist-and-paper world with **one** confident action colour.

- **Action Coral** (#FB5A5F): the only accent — primary buttons, active tab,
  progress, links. *If it's coral, you can tap it.* Pressed: #F23D46 / #D32731.
  Wash (#FFF0F1) for soft buttons and selected rows.
- **Midnight Ink** (#04002E): all titles, values and names.
- **Slate / Muted Ink**: secondary text, labels, placeholders.
- **Mist Page** (#F4F6FA) behind white cards; **Hairline** (#D7DDE6) for dividers.
- **Status:** Done green (#17795A), Missed red (#D12A41) — red is reserved for
  missed/failed only.

## Typography

Body and controls use the **system font** (SF on Apple, Roboto on Android): it
is instant, works offline and matches the OS. **Poppins** is the display face
(Cairo in Arabic) for large titles and headline numbers. Sizes in rem; inputs
never below 16px so iOS doesn't zoom. Arabic mirrors fully (RTL, 1.6 line-height).

## Shape & depth

Capsule buttons and pills (fully rounded), 24px cards, 14px fields, 32px sheet
tops. Soft, wide, warm-grey shadows — never black in light mode. Light is the
reference; dark follows the system (no in-app switch).

## Layout

A single phone-width column on a mist page; white cards; one bottom sheet at a
time. Safe-area insets honoured; the tab bar slides away with the keyboard.

## Navigation

- **Tab bar:** a floating Liquid Glass capsule. Athletes get Train · Classes ·
  Track · Messages · Profile; coaches get Clients · Programs · Messages · Profile.
  A coral lens slides to the active tab, and the active icon fills. At ≥ 840px
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

The PWA opens on a coral launch screen (`go_train/www/go_train.html`): the app
icon rises into focus over a dot grid, the name slides up, then the app fades in —
"FROM nsdLabs" at the foot.

## Named rules

- **Tap means coral.** Coral only on things that respond to a tap; values are ink.
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
