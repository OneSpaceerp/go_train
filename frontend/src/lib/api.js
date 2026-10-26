// Frappe data layer for the Go Train PWA.
//
// The app's screens call REST-ish paths (api.get('/programs'), api.post(...));
// this adapter maps each to a whitelisted `go_train.api.pwa.*` method, uses the
// Frappe session cookie + CSRF token for auth, and normalizes Frappe field names
// (name, scheduled_date, log_date, program_name…) to the keys the screens expect.
import { clearSession } from './session.js'

export function csrfToken() {
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
    if (await isGuest()) {
      clearSession()
      if (!location.pathname.includes('/login')) location.assign('/gotrain/login')
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

// Upload a file via Frappe's native `/api/method/upload_file` endpoint.
export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('is_private', '0')
  const res = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers: { 'X-Frappe-CSRF-Token': csrfToken() },
    credentials: 'same-origin',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.message?.file_url) {
    throw new Error(data.message || 'Upload failed')
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
    return { user: boot }
  }
  if (path === '/auth/me' && httpMethod === 'PATCH') {
    const updated = await frappe('update_profile', { httpMethod: 'POST', args: body })
    return { user: updated }
  }

  // Calendar, Programs & Workouts
  if (path === '/calendar' && httpMethod === 'GET') {
    return frappe('get_calendar', { args: { month: q.get('month') || '' } })
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
    const w = await frappe('get_workout', { args: { workout: decodeURIComponent(m[1]) } })
    return {
      ...workout(w),
      log: w.my_log ? logRow(w.my_log) : null,
      logs: (w.logs || []).map(logRow),
      comments: w.comments || [],
    }
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
      args: { session: body.session, facility: body.facility },
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
      args: { thread: decodeURIComponent(m[1]), body: body.body },
    })
  }

  // Notifications
  if (path === '/notifications' && httpMethod === 'GET') return frappe('get_notifications')
  if (path === '/notifications/read' && httpMethod === 'POST') {
    return frappe('mark_notifications_read', { httpMethod: 'POST' })
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
  if (path === '/coach/programs' && httpMethod === 'POST') {
    return frappe('create_coach_program', {
      httpMethod: 'POST',
      args: {
        name: body.name,
        description: body.description,
        sport: body.sport,
        kind: body.kind || 'Ongoing',
        price: body.price || 0,
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

export const api = {
  get: (p) => dispatch('GET', p),
  post: (p, b) => dispatch('POST', p, b ?? {}),
  patch: (p, b) => dispatch('PATCH', p, b ?? {}),
}
