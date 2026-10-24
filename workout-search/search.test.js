// Run with: node --test workout-search/search.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./search.js');
const WORKOUTS = require('./data.js');

const TODAY = '2026-10-24';
const index = S.buildIndex(WORKOUTS);
const run = (q, opts = {}) => S.search(index, q, { today: TODAY, ...opts });
const ids = (r) => [...r.topHits, ...r.sections.flatMap((s) => s.results)].map((x) => x.workout.id);

test('case-insensitive match across title, description and log', () => {
  const r = run('DEADLIFT');
  assert.ok(ids(r).includes('h-0113')); // description + log
  assert.ok(ids(r).includes('h-1228')); // description only
});

test('every term must match (AND)', () => {
  const r = run('heba kg');
  for (const id of ids(r)) {
    const w = WORKOUTS.find((x) => x.id === id);
    const all = (w.title + w.description + w.log).toLowerCase();
    assert.ok(all.includes('heba') && all.includes('kg'), id);
  }
  assert.equal(run('heba zzz').total, 0);
});

test('searches the logged result, not only the coach text', () => {
  const r = run('3.07');
  assert.deepEqual(ids(r), ['h-0122']);
  assert.equal(r.sections[0].results[0].snippet.field, 'log');
});

test('"x" matches the multiplication sign ×', () => {
  assert.ok(ids(run('4 x 3')).includes('cp-d1'));
});

test('quoted phrase stays together', () => {
  assert.deepEqual(ids(run('"empty bar"')).sort(), ['h-0107', 'h-1230']);
});

test('Arabic: hamza and taa marbuta forms fold together', () => {
  assert.deepEqual(ids(run('احسنت')), ['cp-d1']); // typed without hamza
  assert.deepEqual(ids(run('هبه')), ['cp-d1']); // typed with ه instead of ة
});

test('title matches rank into Top Hits', () => {
  const r = run('strength');
  assert.equal(r.topHits.length, 3);
  for (const h of r.topHits) assert.ok(h.titleRanges.length > 0);
});

test('results outside Top Hits are newest first, in Notes-style date sections', () => {
  const r = run('min');
  const dates = r.sections.flatMap((s) => s.results).map((x) => x.workout.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal(S.dateSection('2026-10-24', TODAY), 'Today');
  assert.equal(S.dateSection('2026-10-20', TODAY), 'Previous 7 Days');
  assert.equal(S.dateSection('2026-10-03', TODAY), 'Previous 30 Days');
  assert.equal(S.dateSection('2026-01-21', TODAY), 'January');
  assert.equal(S.dateSection('2025-12-30', TODAY), 'December 2025');
});

test('highlight ranges point at the original text', () => {
  const w = WORKOUTS.find((x) => x.id === 'h-0121');
  const ranges = S.findInText(w.description, 'BENCH');
  assert.equal(ranges.length, 1);
  assert.equal(w.description.slice(ranges[0].start, ranges[0].end), 'Bench');
});

test('suggestion filters work with and without a query', () => {
  assert.deepEqual(ids(run('', { filter: 'missed' })), ['h-0104b']);
  assert.deepEqual(ids(run('', { filter: 'attachments' })), ['h-0113']);
  assert.equal(run('run', { filter: 'logged' }).total, 2);
});

test('snippet is the matching line, with a highlight inside it', () => {
  const r = run('seal');
  const hit = r.sections[0].results[0];
  const { text, ranges } = hit.snippet;
  assert.ok(ranges.length > 0);
  assert.equal(text.slice(ranges[0].start, ranges[0].end).toLowerCase(), 'seal');
});
