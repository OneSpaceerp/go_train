/*
 * Train Track workout search engine.
 *
 * Modelled on Apple Notes search:
 *   - one field searches every program and every searchable part of a workout
 *     (title, coach description, the athlete's logged result, comments)
 *   - results update live while typing
 *   - the best matches are pulled into "Top Hits"; the rest are grouped by date
 *   - each result shows a one-line snippet with the matched words highlighted
 *   - when the field is empty, suggestion filters are shown instead of results
 *   - opening a result keeps the query and highlights every match (Find in Note)
 *
 * Matching is case-, accent- and Arabic-letter-form-insensitive, so "SQUAT",
 * "squat" and "Squat" are the same, and "اكل" matches "أكل".
 *
 * Works as a browser global (window.WorkoutSearch) and as a CommonJS module.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WorkoutSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ARABIC_FOLD = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
    'ى': 'ي', 'ئ': 'ي',
    'ؤ': 'و',
    'ة': 'ه',
    'ـ': '', // tatweel
  };
  const OTHER_FOLD = { '×': 'x', '–': '-', '—': '-', '’': "'", '‘': "'" };

  // Search fields, in the order a snippet is chosen from (title is shown separately).
  const FIELDS = [
    { key: 'title', weight: 10 },
    { key: 'description', weight: 3 },
    { key: 'log', weight: 4 },
    { key: 'comments', weight: 2 },
  ];

  const SUGGESTIONS = [
    { id: 'logged', label: 'Workouts I logged', icon: 'log', test: (w) => !!(w.log && w.log.trim()) },
    { id: 'comments', label: 'Workouts with comments', icon: 'comment', test: (w) => (w.comments || []).length > 0 },
    { id: 'attachments', label: 'Workouts with files', icon: 'clip', test: (w) => (w.attachments || []).length > 0 },
    { id: 'missed', label: 'Missed workouts', icon: 'missed', test: (w) => w.status === 'missed' },
  ];

  function foldChar(ch) {
    if (ch in ARABIC_FOLD) return ARABIC_FOLD[ch];
    if (ch in OTHER_FOLD) return OTHER_FOLD[ch];
    const code = ch.charCodeAt(0);
    // Arabic-Indic and Eastern Arabic-Indic digits -> 0-9
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    // Strip combining marks: Latin accents and Arabic tashkeel
    return ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  /**
   * Fold a string for matching and keep a map from every folded character back
   * to its index in the original, so matches can be highlighted in the original.
   */
  function fold(text) {
    let out = '';
    const map = [];
    const chars = Array.from(text || '');
    let offset = 0;
    for (const ch of chars) {
      const f = foldChar(ch);
      for (let k = 0; k < f.length; k++) {
        out += f[k];
        map.push(offset);
      }
      offset += ch.length;
    }
    map.push(offset); // sentinel: end of string
    return { text: out, map };
  }

  function normalize(text) {
    return fold(text).text.replace(/\s+/g, ' ').trim();
  }

  /** Split a query into terms. "Quoted phrases" stay together. */
  function parseQuery(query) {
    const terms = [];
    const re = /"([^"]+)"|(\S+)/g;
    let m;
    while ((m = re.exec(query || '')) !== null) {
      const t = normalize(m[1] || m[2]);
      if (t) terms.push(t);
    }
    return terms;
  }

  const isWordChar = (c) => /[\p{L}\p{N}]/u.test(c);

  /** All [start, end) ranges of `term` inside folded text, with a word-start flag. */
  function findTerm(foldedText, term) {
    const hits = [];
    if (!term) return hits;
    let i = foldedText.indexOf(term);
    while (i !== -1) {
      const wordStart = i === 0 || !isWordChar(foldedText[i - 1]);
      hits.push({ start: i, end: i + term.length, wordStart });
      i = foldedText.indexOf(term, i + 1);
    }
    return hits;
  }

  function fieldText(workout, key) {
    if (key === 'comments') return (workout.comments || []).map((c) => c.text).join('\n');
    return workout[key] || '';
  }

  /** Build a per-workout search index once; reused for every keystroke. */
  function buildIndex(workouts) {
    return workouts.map((w) => {
      const fields = {};
      for (const f of FIELDS) fields[f.key] = fold(fieldText(w, f.key));
      return { workout: w, fields };
    });
  }

  /** Convert folded ranges to ranges in the original string, merged and sorted. */
  function toOriginalRanges(folded, ranges) {
    const out = ranges
      .map((r) => ({ start: folded.map[r.start], end: folded.map[r.end] }))
      .sort((a, b) => a.start - b.start);
    const merged = [];
    for (const r of out) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
      else merged.push({ ...r });
    }
    return merged;
  }

  /** Score one indexed workout against the terms. Every term must match somewhere (AND). */
  function scoreEntry(entry, terms) {
    let score = 0;
    const ranges = {};
    for (const term of terms) {
      let termMatched = false;
      for (const f of FIELDS) {
        const hits = findTerm(entry.fields[f.key].text, term);
        if (!hits.length) continue;
        termMatched = true;
        (ranges[f.key] = ranges[f.key] || []).push(...hits);
        const best = hits.some((h) => h.wordStart) ? 1 : 0.4; // whole-word/prefix beats mid-word
        score += f.weight * best + Math.min(hits.length - 1, 4) * 0.5;
      }
      if (!termMatched) return null;
    }
    const title = entry.fields.title.text;
    if (terms.length && terms.join(' ') === title.trim()) score += 8; // exact title
    const highlights = {};
    for (const key of Object.keys(ranges)) highlights[key] = toOriginalRanges(entry.fields[key], ranges[key]);
    return { score, highlights };
  }

  /** One line of context around the first match outside the title. */
  function makeSnippet(workout, highlights) {
    for (const key of ['log', 'description', 'comments']) {
      const ranges = highlights[key];
      if (!ranges || !ranges.length) continue;
      const text = fieldText(workout, key);
      const first = ranges[0];
      let lineStart = text.lastIndexOf('\n', first.start - 1) + 1;
      let lineEnd = text.indexOf('\n', first.end);
      if (lineEnd === -1) lineEnd = text.length;
      // Long lines: trim to ~40 chars before the match, like Notes does.
      let prefix = '';
      if (first.start - lineStart > 40) {
        lineStart = text.indexOf(' ', first.start - 40) + 1 || first.start;
        prefix = '…';
      }
      const line = text.slice(lineStart, lineEnd);
      const lineRanges = ranges
        .filter((r) => r.start >= lineStart && r.end <= lineEnd)
        .map((r) => ({ start: r.start - lineStart + prefix.length, end: r.end - lineStart + prefix.length }));
      return { field: key, text: prefix + line, ranges: lineRanges };
    }
    // No body match (title-only hit, or no query): first non-empty description line.
    const firstLine = (workout.description || '').split('\n').find((l) => l.trim()) || '';
    return { field: 'description', text: firstLine, ranges: [] };
  }

  const DAY = 86400000;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];

  /** Notes-style date section: Today / Previous 7 Days / Previous 30 Days / Month Year. */
  function dateSection(dateStr, today) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const t = new Date(today + 'T00:00:00Z');
    const diff = Math.round((t - d) / DAY);
    if (diff <= 0) return 'Today';
    if (diff <= 7) return 'Previous 7 Days';
    if (diff <= 30) return 'Previous 30 Days';
    const sameYear = d.getUTCFullYear() === t.getUTCFullYear();
    return MONTHS[d.getUTCMonth()] + (sameYear ? '' : ' ' + d.getUTCFullYear());
  }

  /**
   * Run a search.
   * @param index    from buildIndex()
   * @param query    raw text from the search field
   * @param options  { filter: suggestion id, program: program name, today: 'YYYY-MM-DD', topHits: n }
   * @returns {{ total, topHits: Result[], sections: {title, results: Result[]}[] }}
   */
  function search(index, query, options = {}) {
    const terms = parseQuery(query);
    const today = options.today || new Date().toISOString().slice(0, 10);
    const suggestion = SUGGESTIONS.find((s) => s.id === options.filter);
    const results = [];

    for (const entry of index) {
      const w = entry.workout;
      if (suggestion && !suggestion.test(w)) continue;
      if (options.program && w.program !== options.program) continue;
      const scored = terms.length ? scoreEntry(entry, terms) : { score: 0, highlights: {} };
      if (!scored) continue;
      results.push({
        workout: w,
        score: scored.score,
        highlights: scored.highlights,
        titleRanges: scored.highlights.title || [],
        snippet: makeSnippet(w, scored.highlights),
      });
    }

    const byDate = (a, b) => (a.workout.date < b.workout.date ? 1 : a.workout.date > b.workout.date ? -1 : 0);

    // Top Hits only when there's a real query and enough results to make it useful.
    const topN = options.topHits ?? 3;
    let topHits = [];
    if (terms.length && results.length > topN) {
      topHits = [...results].sort((a, b) => b.score - a.score || byDate(a, b)).slice(0, topN);
    }
    const rest = results.filter((r) => !topHits.includes(r)).sort(byDate);

    const sections = [];
    for (const r of rest) {
      const title = dateSection(r.workout.date, today);
      let s = sections[sections.length - 1];
      if (!s || s.title !== title) sections.push((s = { title, results: [] }));
      s.results.push(r);
    }
    return { total: results.length, terms, topHits, sections };
  }

  /** All match ranges of the query in one string — powers "Find in Workout". */
  function findInText(text, query) {
    const terms = parseQuery(query);
    if (!terms.length) return [];
    const folded = fold(text);
    const hits = [];
    for (const t of terms) hits.push(...findTerm(folded.text, t));
    return toOriginalRanges(folded, hits);
  }

  return { fold, normalize, parseQuery, buildIndex, search, findInText, dateSection, SUGGESTIONS };
});
