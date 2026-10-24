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
  family: "Poppins, Cairo, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
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

Poppins (Cairo for Arabic), three weights (400/500/600), no display face. Sizes
in rem; inputs never below 16px so iOS doesn't zoom. Arabic mirrors fully (RTL,
1.6 line-height).

## Shape & depth

Capsule buttons and pills (fully rounded), 24px cards, 14px fields, 32px sheet
tops. Soft, wide, warm-grey shadows — never black in light mode. Light is the
reference; dark follows the system (no in-app switch).

## Layout

A single phone-width column on a mist page; white cards; a floating bottom tab
bar (Train · Track · Messages · Profile); one bottom sheet at a time. Safe-area
insets honoured; the tab bar and floating buttons slide away with the keyboard.

## Launch

The PWA opens on a coral launch screen (`go_train/www/go_train.html`): the app
icon rises into focus over a dot grid, the name slides up, then the app fades in —
"FROM nsdLabs" at the foot.

## Named rules

- **Tap means coral.** Coral only on things that respond to a tap; values are ink.
- **Red is final.** Missed/failed only — never "pending" or emphasis.
- **One column, one sheet, one primary action** per screen.
