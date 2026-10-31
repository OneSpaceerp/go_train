// Frappe data layer for the Go Train PWA.
//
// The app's screens call REST-ish paths (api.get('/programs'), api.post(...));
// this adapter maps each to a whitelisted `go_train.api.pwa.*` method, uses the
// Frappe session cookie + CSRF token for auth, and normalizes Frappe field names
// (name, scheduled_date, log_date, program_name…) to the keys the screens expect.
import { clearSession } from './session.js'
import {
  readCache,
  writeCache,
  enqueueOfflineMutation,
  flushOfflineQueue,
  setUnreadBadge,
} from './pwa.js'

// Refreshed from every boot() response: the token embedded in the page belongs
// to the session that rendered it (e.g. Guest before an in-app login).
let liveCsrfToken = ''

export function setCsrfToken(token) {
  if (token) liveCsrfToken = token
}

export function csrfToken() {
  if (liveCsrfToken) return liveCsrfToken
  try {
    const boot = JSON.parse(document.getElementById('go-train-boot')?.textContent || '{}')
    if (boot.csrf_token && !String(boot.csrf_token).includes('{{')) return boot.csrf_token
  } catch {}
  const meta = document.querySelector('meta[name="csrf-token"]')?.content
  return meta && !meta.includes('{{') ? meta : ''
}

// Readable message from a Frappe error response (`_server_messages` is a JSON
// list of JSON-encoded {message} objects).
export function serverMessage(data) {
  try {
    const msgs = JSON.parse(data?._server_messages || '[]')
      .map((m) => { try { return JSON.parse(m).message } catch { return m } })
      .filter(Boolean)
    if (msgs.length) return msgs.join('\n').replace(/<[^>]+>/g, '')
  } catch {}
  return typeof data?.message === 'string' ? data.message : data?.exception || ''
}

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message)
    this.status = status
    this.network = network
  }
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
  let res
  try {
    res = await fetch(finalUrl, init)
  } catch {
    throw new ApiError('You appear to be offline', { network: true })
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null
  if (res.status === 401 || res.status === 403) {
    if (await isGuest()) {
      clearSession()
      if (!location.pathname.includes('/login')) location.assign('/gotrain/login')
      throw new ApiError('Not signed in', { status: res.status })
    }
    throw new ApiError(serverMessage(data) || 'You don’t have access to this', { status: res.status })
  }
  if (!res.ok) {
    throw new ApiError(serverMessage(data) || `Request failed (${res.status})`, { status: res.status })
  }
  return data?.message
}

async function isGuest() {
  try {
    const r = await fetch('/api/method/frappe.auth.get_logged_user', { credentials: 'same-origin' })
    const d = await r.json()
    return !d.message || d.message === 'Guest'
  } catch { return true }
}

// Upload a file via Frappe's native `/api/method/upload_file` endpoint.
export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file, file.name)
  // Private: served only to the uploader and to users who can read the
  // Workout Log it gets attached to (the athlete's coach).
  form.append('is_private', '1')
  const res = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': csrfToken() },
    credentials: 'same-origin',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.message?.file_url) {
    throw new Error(serverMessage(data) || 'Upload failed')
  }
  return {
    url: data.message.file_url,
    name: data.message.file_name || file.name,
  }
}

// --- field normalizers ----------------------------------------------------
const program = (p) => ({ ...p, id: p.name, name: p.program_name || p.name })
const logRow = (l) => ({
  ...l,
  id: l.name,
  logged_on: l.log_date,
  status: (l.status || '').toLowerCase(),
  attachment_url: l.attachment_url || l.attachment || null,
  attachment_name: l.attachment_name || (l.attachment ? l.attachment.split('/').pop() : null),
})
const workout = (w) => ({
  ...w,
  id: w.name,
  scheduled_on: w.scheduled_date,
  my_log: w.my_log ? logRow(w.my_log) : null,
})
const workoutDetail = (w) => ({
  ...workout(w),
  log: w.my_log ? logRow(w.my_log) : null,
  logs: (w.logs || []).map(logRow),
  comments: w.comments || [],
})
const historyRow = (r) => ({
  ...r,
  id: r.name,
  scheduled_on: r.scheduled_date,
  logged_on: r.log_date,
  status: (r.status || '').toLowerCase(),
})

// --- path dispatch --------------------------------------------------------
async function dispatch(httpMethod, rawPath, body) {
  const [path, query] = rawPath.split('?')
  const q = new URLSearchParams(query || '')
  let m

  // Auth & Profile
  if (path === '/auth/me' && httpMethod === 'GET') {
    const boot = await frappe('boot')
    setCsrfToken(boot?.csrf_token)
    return { user: boot }
  }
  if (path === '/auth/me' && httpMethod === 'PATCH') {
    const updated = await frappe('update_profile', { httpMethod: 'POST', args: body })
    setCsrfToken(updated?.csrf_token)
    return { user: updated }
  }

  // Calendar, Programs & Workouts
  if (path === '/calendar' && httpMethod === 'GET') {
    return frappe('get_calendar', { args: { month: q.get('month') || '' } })
  }
  if (path === '/feed' && httpMethod === 'GET') {
    return (await frappe('get_feed', { args: { month: q.get('month') || '' } })).map((w) => ({
      ...workout(w),
      program_id: w.program,
    }))
  }
  if (path === '/programs' && httpMethod === 'GET') {
    return (await frappe('get_programs')).map(program)
  }
  if ((m = path.match(/^\/programs\/(.+)\/workouts$/)) && httpMethod === 'GET') {
    return (await frappe('get_program_workouts', { args: { program: decodeURIComponent(m[1]) } })).map(workout)
  }
  if ((m = path.match(/^\/programs\/(.+)\/workouts$/)) && httpMethod === 'POST') {
    return frappe('create_coach_workout', {
      httpMethod: 'POST',
      args: {
        program: decodeURIComponent(m[1]),
        title: body.title,
        body: body.body,
        letter: body.letter || 'A',
        scheduled_date: body.scheduled_on,
        coach_notes: body.coach_notes,
      },
    })
  }
  if ((m = path.match(/^\/workouts\/([^/]+)$/)) && httpMethod === 'GET') {
    return workoutDetail(await frappe('get_workout', { args: { workout: decodeURIComponent(m[1]) } }))
  }
  if ((m = path.match(/^\/workouts\/([^/]+)\/movements$/)) && httpMethod === 'POST') {
    return workoutDetail(
      await frappe('save_workout_movements', {
        httpMethod: 'POST',
        args: { workout: decodeURIComponent(m[1]), movements: body.movements },
      }),
    )
  }
  if ((m = path.match(/^\/workouts\/([^/]+)\/logs$/)) && httpMethod === 'GET') {
    return ((await frappe('get_workout', { args: { workout: decodeURIComponent(m[1]) } })).logs || []).map(logRow)
  }
  if ((m = path.match(/^\/workouts\/([^/]+)\/log$/)) && httpMethod === 'POST') {
    return frappe('log_workout', {
      httpMethod: 'POST',
      args: {
        workout: decodeURIComponent(m[1]),
        status: body.status === 'missed' ? 'Missed' : 'Done',
        result: body.result,
        details: body.details,
        rpe: body.rpe,
        duration: body.duration_seconds,
        attachment: body.attachment_url,
        attachment_name: body.attachment_name,
        set_logs: body.set_logs,
        movement_media: body.movement_media,
        client_time: body.client_time,
        client_op_id: body.client_op_id,
      },
    })
  }
  if ((m = path.match(/^\/workouts\/([^/]+)\/comments$/)) && httpMethod === 'POST') {
    return frappe('add_workout_comment', {
      httpMethod: 'POST',
      args: { workout: decodeURIComponent(m[1]), body: body.body },
    })
  }

  // History, Insights & Tracking
  if (path === '/history' && httpMethod === 'GET') {
    return (await frappe('get_history', { args: { q: q.get('q') || '' } })).map(historyRow)
  }
  if (path === '/insights' && httpMethod === 'GET') return frappe('get_insights')
  if (path === '/tracking' && httpMethod === 'GET') return frappe('get_tracking')
  if (path === '/tracking' && httpMethod === 'POST') {
    return frappe('add_progress_entry', {
      httpMethod: 'POST',
      args: {
        metric: body.metric,
        value: body.value,
        unit: body.unit || 'kg',
        recorded_date: body.recorded_date,
        notes: body.notes,
        client_time: body.client_time,
        client_op_id: body.client_op_id,
      },
    })
  }

  // Classes, Booking & Check-in
  if (path === '/classes' && httpMethod === 'GET') return frappe('get_classes')
  if ((m = path.match(/^\/classes\/([^/]+)\/book$/)) && httpMethod === 'POST') {
    return frappe('book_class', { httpMethod: 'POST', args: { session: decodeURIComponent(m[1]) } })
  }
  if ((m = path.match(/^\/classes\/([^/]+)\/cancel$/)) && httpMethod === 'POST') {
    return frappe('cancel_booking', {
      httpMethod: 'POST',
      args: { session: decodeURIComponent(m[1]), booking: body.booking },
    })
  }
  if (path === '/checkin' && httpMethod === 'POST') {
    return frappe('check_in', {
      httpMethod: 'POST',
      args: {
        session: body.session,
        facility: body.facility,
        client_time: body.client_time,
        client_op_id: body.client_op_id,
      },
    })
  }

  // Exercise Library
  if (path === '/exercises' && httpMethod === 'GET') {
    return frappe('get_exercises', {
      args: { q: q.get('q') || '', sport: q.get('sport') || '', category: q.get('category') || '' },
    })
  }

  // Direct Messages & Threads
  if (path === '/threads' && httpMethod === 'GET') return frappe('get_threads')
  if ((m = path.match(/^\/threads\/([^/]+)\/messages$/)) && httpMethod === 'GET') {
    return frappe('get_thread_messages', { args: { thread: decodeURIComponent(m[1]) } })
  }
  if ((m = path.match(/^\/threads\/([^/]+)\/messages$/)) && httpMethod === 'POST') {
    return frappe('send_thread_message', {
      httpMethod: 'POST',
      args: { thread: decodeURIComponent(m[1]), body: body.body, files: JSON.stringify(body.files || []) },
    })
  }

  // Notifications
  if (path === '/notifications' && httpMethod === 'GET') {
    const items = await frappe('get_notifications')
    setUnreadBadge((items || []).filter((n) => !n.read_at).length)
    return items
  }
  if (path === '/notifications/read' && httpMethod === 'POST') {
    const res = await frappe('mark_notifications_read', { httpMethod: 'POST' })
    setUnreadBadge(0)
    return res
  }

  // Marketplace, Promos & Gym Team
  if (path === '/marketplace' && httpMethod === 'GET') return frappe('get_marketplace')
  if (path === '/marketplace/purchases' && httpMethod === 'GET') return frappe('get_marketplace_purchases')
  if (path === '/marketplace/sales' && httpMethod === 'GET') return frappe('get_marketplace_sales')
  if ((m = path.match(/^\/marketplace\/([^/]+)\/buy$/)) && httpMethod === 'POST') {
    return frappe('buy_program', { httpMethod: 'POST', args: { program: decodeURIComponent(m[1]) } })
  }
  if (path === '/promos' && httpMethod === 'GET') return frappe('get_promos')
  if (path === '/gym/team' && httpMethod === 'GET') return frappe('get_gym_team')

  // Coach
  if (path === '/coach/clients' && httpMethod === 'GET') return frappe('get_coach_clients')
  if (path === '/coach/programs' && httpMethod === 'GET') {
    return (await frappe('get_coach_programs')).map(program)
  }
  if (path === '/coach/programs' && httpMethod === 'POST') {
    return frappe('create_coach_program', {
      httpMethod: 'POST',
      args: {
        name: body.name,
        description: body.description,
        sport: body.sport,
        kind: body.kind || 'Ongoing',
        price: body.price || 0,
        is_published: body.is_published ? 1 : 0,
      },
    })
  }
  if (path === '/coach/assign' && httpMethod === 'POST') {
    return frappe('assign_member_program', {
      httpMethod: 'POST',
      args: { member: body.member, program: body.program },
    })
  }

  console.warn('[go-train] unmapped api path:', httpMethod, path)
  return httpMethod === 'GET' ? [] : {}
}

// Device wall-clock time, sent with queued mutations so a replayed log or
// check-in keeps the date it actually happened (the server clamps it).
function localTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function newOpId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const isQueueable = (p) => /^\/workouts\/[^/]+\/log$/.test(p) || p === '/tracking' || p === '/checkin'

export const api = {
  cached: (p) => readCache(p),
  get: async (p) => {
    try {
      const data = await dispatch('GET', p)
      writeCache(p, data)
      return data
    } catch (err) {
      // Only fall back to cached data when the server is unreachable; a
      // permission or validation error must not show stale data silently.
      if (err?.network) {
        const cached = readCache(p)
        if (cached !== null) return cached
      }
      throw err
    }
  },
  post: async (p, b) => {
    const body = { ...(b ?? {}) }
    if (isQueueable(p)) {
      body.client_time ??= localTimestamp()
      body.client_op_id ??= newOpId()
    }
    try {
      return await dispatch('POST', p, body)
    } catch (err) {
      if (err?.network && isQueueable(p)) {
        enqueueOfflineMutation({ method: 'POST', path: p, body })
        return { ok: true, queued: true }
      }
      throw err
    }
  },
  patch: (p, b) => dispatch('PATCH', p, b ?? {}),
}

export const flushQueue = () => flushOfflineQueue((item) => dispatch(item.method, item.path, item.body))

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushQueue)
}
