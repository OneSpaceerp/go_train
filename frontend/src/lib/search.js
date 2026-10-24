// Client-side highlight + grouping for the History search. The actual filtering
// happens server-side (ILIKE over title/body/result/program); here we only fold
// text for highlighting and group results into Notes-style date sections.
import { dateSection } from './format.js'

const ARABIC_FOLD = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه', 'ـ': '' }
const OTHER_FOLD = { '×': 'x', '–': '-', '—': '-' }

function foldChar(ch) {
  if (ch in ARABIC_FOLD) return ARABIC_FOLD[ch]
  if (ch in OTHER_FOLD) return OTHER_FOLD[ch]
  const code = ch.charCodeAt(0)
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660)
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0)
  return ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function fold(text) {
  let out = ''
  const map = []
  let offset = 0
  for (const ch of Array.from(text || '')) {
    const f = foldChar(ch)
    for (const c of f) { out += c; map.push(offset) }
    offset += ch.length
  }
  map.push(offset)
  return { text: out, map }
}

const parseTerms = (q) =>
  (q || '').match(/"([^"]+)"|(\S+)/g)?.map((t) => fold(t.replace(/"/g, '')).text).filter(Boolean) || []

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Return HTML for `text` with every occurrence of the query terms wrapped in <mark>.
export function highlight(text = '', query = '') {
  const terms = parseTerms(query)
  if (!terms.length) return esc(text)
  const folded = fold(text)
  const ranges = []
  for (const term of terms) {
    let i = folded.text.indexOf(term)
    while (i !== -1) { ranges.push([i, i + term.length]); i = folded.text.indexOf(term, i + 1) }
  }
  if (!ranges.length) return esc(text)
  ranges.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  let html = '', at = 0
  for (const [s, e] of merged) {
    const os = folded.map[s], oe = folded.map[e]
    html += esc(text.slice(at, os)) + '<mark>' + esc(text.slice(os, oe)) + '</mark>'
    at = oe
  }
  return html + esc(text.slice(at))
}

// Best one-line snippet from body/result for a search hit.
export function snippet(row, query) {
  const terms = parseTerms(query)
  for (const field of ['result', 'body']) {
    const text = row[field]
    if (!text) continue
    if (!terms.length) return { field, text: text.split('\n').find((l) => l.trim()) || '' }
    const folded = fold(text).text
    const hit = terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0]
    if (hit == null) continue
    const start = text.lastIndexOf('\n', hit - 1) + 1
    let end = text.indexOf('\n', hit)
    if (end === -1) end = text.length
    return { field, text: text.slice(start, end) }
  }
  const body = row.body || ''
  return { field: 'body', text: body.split('\n').find((l) => l.trim()) || '' }
}

// Group rows (newest first) into Notes-style date sections.
export function groupByDate(rows) {
  const sections = []
  for (const r of rows) {
    const title = dateSection(r.logged_on || r.scheduled_on)
    let s = sections[sections.length - 1]
    if (!s || s.title !== title) sections.push((s = { title, rows: [] }))
    s.rows.push(r)
  }
  return sections
}
