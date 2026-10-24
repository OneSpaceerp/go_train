# How search works in Apple Notes, and how Train Track can do the same

## 1. Apple Notes search: the evidence

There was no Notes source code in this folder, so "Notes app" is taken to be Apple Notes on
iPhone (the Train Track screenshots are from an iPhone). The evidence comes in two kinds,
kept separate below.

### A. Documented by Apple (primary sources)

| # | Behavior | Source |
|---|----------|--------|
| A1 | One **Search field** at the top of the notes list. Tap it and type; it searches typed **and handwritten** notes. | [Use Notes on your iPhone](https://support.apple.com/en-ie/118442), [iPad User Guide: search notes](https://support.apple.com/en-au/guide/ipad/ipadc44c8c4a/ios) |
| A2 | The search field is revealed by **scrolling to the top** of the notes list. | iPad User Guide |
| A3 | Search covers **content inside attachments**: objects in images ("bike") and text in scanned documents (receipts, bills). | Use Notes on your iPhone |
| A4 | **Find in Note**: open a note, choose Find in Note, type, and *"the matches are highlighted in the note."* | iPad User Guide; Use Notes on your iPhone |
| A5 | An **Attachment browser** (More → View Attachments) lists sketches, photos, links and documents. **Show in Note** jumps to the note that holds one. | Both |
| A6 | **Locked notes**: only the title appears in search results, and their attachments are hidden. | iPad User Guide |
| A7 | **Tags and Smart Folders** filter notes across folders. Sorting is by date edited, date created or title. | Use Notes on your iPhone |
| A8 | **Siri** can search notes from natural language ("Show notes from today"). | Both |
| A9 | Handwriting search isn't available in every language. | iPad User Guide |

### B. Observed iOS Notes UI behavior (not verified on a device in this session)

These are well-known parts of the Notes search screen. Apple's guides don't spell them out,
and no iPhone was available here to capture screenshots. Before treating them as proof,
record a short screen video on an iPhone (Notes → pull down → Search).

- **B1 Live results**: the list filters on every keystroke, with no Search button.
- **B2 Suggested searches** while the field is empty: Shared Notes, Locked Notes, Notes with
  Drawings, Notes with Checklists, Notes with Tags, Notes with Attachments, Scanned Documents.
- **B3 Top Hits**: the best few matches are pinned above the rest.
- **B4 Date sections**: the remaining results are grouped into Today / Previous 7 Days /
  Previous 30 Days / month.
- **B5 Snippet with highlight**: each result shows its title plus a line of text with the
  matched words highlighted.
- **B6 Matching** ignores case and accents, needs every typed word to appear (AND), and
  matches the start of words.
- **B7 The query carries into the note**: opening a result highlights the matches inside it.

## 2. Train Track today (from `train_track_screens/`)

- Screens 9–14: the **History** sheet (opened from the clock button on a workout card) already
  has a `Search` field above a list of past workout cards. Each card has a date, title, the
  coach's description, and the athlete's logged result in a grey italic block.
- There are no visible suggestions, highlights, grouping, ranking or find-in-workout.
- The data is a good fit for search: exercise names (squat, deadlift, thruster), loads
  ("56 kg"), results ("3.07 kilometers"), people ("heba", "nada"), and coach comments, some in
  Arabic (the app has an Arabic language toggle).

## 3. What was built: `workout-search/`

A working prototype of Notes-style search for the History sheet, in Train Track's visual style.

| Notes behavior | Train Track feature | Where |
|---|---|---|
| A1, B1 One field, live results | History search field filters on every keystroke | `index.html` → `render()` |
| A3 Searches inside content | Searches **title, coach description, your logged result, comments** | `search.js` → `FIELDS` |
| B2 Suggested searches | *Workouts I logged / with comments / with files / Missed*, each with a count, plus **Recent searches** | `SUGGESTIONS`, `suggestionsHtml()` |
| A7 Tags / Smart Folders | **Program chips** (All, Competition Prep, Strength & Engine…) | `renderChips()` |
| B3 Top Hits | The top 3 by score (title > log > description > comments; word-start > mid-word) | `search()` |
| B4 Date sections | Today / Previous 7 Days / Previous 30 Days / Month [Year] | `dateSection()` |
| B5 Highlighted snippet | Best matching line with `<mark>`, tagged *In your log* / *In comments* | `makeSnippet()` |
| B6 Forgiving matching | Ignores case and accents; AND across words; `"quoted phrases"`; `x` matches `×`; Arabic أ/إ/آ→ا, ة→ه, ى→ي, tashkeel removed, Arabic-Indic digits | `fold()`, `parseQuery()` |
| A4, B7 Find in Note | **Find in workout**: query carried over, all matches highlighted, "2 of 5", ↑/↓ and Enter / Shift+Enter | `renderDetail()`, `step()` |
| A6 Locked notes | (not applicable; noted for a future "private notes" feature) | — |

### Run it

```bash
node --test workout-search/search.test.js
```

```bash
npx --yes http-server@14.1.1 workout-search -p 5178 -c-1
```

Then open http://localhost:5178. Press `/` or tap the history or search button.

### Verified

- 11 unit tests pass: matching, AND, phrases, × folding, Arabic folding, Top Hits, date
  sections, highlight offsets, filters, and snippets.
- Checked in a browser at phone width: live results, Top Hits, highlighting, suggestion
  filter chip, empty state, Find in workout ("2 of 2" landing on a match inside an RTL Arabic
  comment), no horizontal scroll.

### Porting to the real app

The engine (`search.js`) is pure functions with no UI dependencies, so it ports one-to-one to
Dart/Swift/Kotlin. For large histories, run the same `fold()` on the server and store the
folded text in a full-text index (Postgres `tsvector`, or SQLite FTS5 on device). Keep
`findInText()` on the client for highlighting.
