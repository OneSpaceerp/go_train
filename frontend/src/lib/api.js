// Frappe data layer for the Go Train PWA.
//
// The app's screens call REST-ish paths (api.get('/programs'), api.post(...));
// this adapter maps each to a whitelisted `go_train.api.pwa.*` method, uses the
// Frappe session cookie + CSRF token for auth, and normalizes Frappe field names
// (name, scheduled_date, log_date, program_name…) to the keys the screens expect
// (id, scheduled_on, logged_on, name…). Modules not built yet (messages, gym,
// marketplace, promos) return empty so their screens show empty states.
import { clearSession } from './session.js'

function csrfToken() {
  try {
    const boot = JSON.parse(document.getElementById('go-train-boot')?.textContent || '{}')
    if (boot.csrf_token && !String(boot.csrf_token).includes('{{')) return boot.csrf_token
  } catch {}
  const meta = document.querySelector('meta[name="csrf-token"]')?.content
  return meta && !meta.includes('{{') ? meta : ''
}

async function frappe(method, { args = {}, httpMethod = 'GET' } = {}) {
  const url = `/api/method/go_train.api.pwa.${method}`
  const headers = { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrfToken() }
  const init = { method: httpMethod, headers, credentials: 'same-origin' }
  let finalUrl = url
  if (httpMethod === 'GET') {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(args)) if (v != null) qs.append(k, v)
    if ([...qs].length) finalUrl += `?${qs}`
  } else {
    init.body = JSON.stringify(args)
  }
  const res = await fetch(finalUrl, init)
  if (res.status === 401 || res.status === 403) {
    clearSession()
    if (await isGuest()) {
      if (!location.pathname.includes('/login')) {
        location.assign(`/login?redirect-to=${encodeURIComponent('/gotrain')}`)
      }
    }
    throw new Error('Not signed in')
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
  if (!res.ok) throw new Error(data?._server_messages || data?.exception || `Request failed (${res.status})`)
  return data?.message
}

async function isGuest() {
  try {
    const r = await fetch('/api/method/frappe.auth.get_logged_user', { credentials: 'same-origin' })
    const d = await r.json()
    return !d.message || d.message === 'Guest'
  } catch { return true }
}

// --- field normalizers ----------------------------------------------------
const program = (p) => ({ ...p, id: p.name, name: p.program_name || p.name })
const logRow = (l) => ({ ...l, id: l.name, logged_on: l.log_date, status: (l.status || '').toLowerCase() })
const workout = (w) => ({ ...w, id: w.name, scheduled_on: w.scheduled_date,
  my_log: w.my_log ? logRow(w.my_log) : null })
const historyRow = (r) => ({ ...r, id: r.name, scheduled_on: r.scheduled_date,
  logged_on: r.log_date, status: (r.status || '').toLowerCase() })

// --- path dispatch --------------------------------------------------------
async function dispatch(httpMethod, rawPath, body) {
  const [path, query] = rawPath.split('?')
  const q = new URLSearchParams(query || '')
  let m

  if (path === '/auth/me' && httpMethod === 'GET') {
    const boot = await frappe('boot')
    return { user: { ...boot, full_name: boot.full_name, role: 'client' } }
  }
  if (path === '/programs' && httpMethod === 'GET') return (await frappe('get_programs')).map(program)
  if ((m = path.match(/^\/programs\/(.+)\/workouts$/)) && httpMethod === 'GET')
    return (await frappe('get_program_workouts', { args: { program: m[1] } })).map(workout)
  if ((m = path.match(/^\/workouts\/([^/]+)$/)) && httpMethod === 'GET') {
    const w = await frappe('get_workout', { args: { workout: m[1] } })
    return { ...workout(w), log: w.my_log ? logRow(w.my_log) : null,
      logs: (w.logs || []).map(logRow), comments: [] }
  }
  if ((m = path.match(/^\/workouts\/([^/]+)\/logs$/)) && httpMethod === 'GET')
    return ((await frappe('get_workout', { args: { workout: m[1] } })).logs || []).map(logRow)
  if ((m = path.match(/^\/workouts\/([^/]+)\/log$/)) && httpMethod === 'POST')
    return frappe('log_workout', { httpMethod: 'POST', args: {
      workout: m[1], status: body.status === 'missed' ? 'Missed' : 'Done',
      result: body.result, details: body.details, rpe: body.rpe,
      duration: body.duration_seconds, attachment: body.attachment_url } })
  if ((m = path.match(/^\/workouts\/([^/]+)\/comments$/)) && httpMethod === 'POST')
    return { id: 'local', body: body.body, author: 'You', author_role: 'member' }
  if (path === '/history' && httpMethod === 'GET')
    return (await frappe('get_history', { args: { q: q.get('q') || '' } })).map(historyRow)
  if (path === '/insights' && httpMethod === 'GET') return frappe('get_insights')
  if (path === '/tracking' && httpMethod === 'GET') return frappe('get_tracking')
  if (path === '/classes' && httpMethod === 'GET') return frappe('get_classes')

  // Modules not yet built on ERPNext — empty states, no errors.
  const emptyArray = ['/threads', '/notifications', '/exercises', '/marketplace',
    '/marketplace/purchases', '/marketplace/sales', '/promos', '/coach/clients']
  if (emptyArray.includes(path) && httpMethod === 'GET') return []
  if (path === '/gym/team' && httpMethod === 'GET') return null

  console.warn('[go-train] unmapped api path:', httpMethod, path)
  return httpMethod === 'GET' ? [] : {}
}

export const api = {
  get: (p) => dispatch('GET', p),
  post: (p, b) => dispatch('POST', p, b ?? {}),
  patch: (p, b) => dispatch('PATCH', p, b ?? {}),
}
