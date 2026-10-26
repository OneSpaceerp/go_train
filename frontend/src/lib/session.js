// Auth session: current user & preferences, kept in a reactive store and localStorage.
import { reactive } from 'vue'

const TOKEN_KEY = 'go-train-token'
const USER_KEY = 'go-train-user'
const ROLE_MODE_KEY = 'go-train-role-mode'

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }

export const session = reactive({
  token: (() => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } })(),
  user: read(USER_KEY),
})

export const getToken = () => session.token
export const isCoach = () => session.user?.role === 'coach'

export function setSession(token, user) {
  session.token = token
  setUser(user)
  try { localStorage.setItem(TOKEN_KEY, token) } catch {}
}

export function setUser(user) {
  if (!user) {
    session.user = null
    return
  }
  const savedMode = localStorage.getItem(ROLE_MODE_KEY)
  const merged = {
    ...(session.user || {}),
    ...user,
  }
  if (merged.is_coach && savedMode in { coach: 1, client: 1 }) {
    merged.role = savedMode
  }
  session.user = merged
  try { localStorage.setItem(USER_KEY, JSON.stringify(merged)) } catch {}
  applyTheme(merged.theme)
  applyLocale(merged.locale)
}

export function setRoleMode(mode) {
  if (!session.user) return
  try { localStorage.setItem(ROLE_MODE_KEY, mode) } catch {}
  setUser({ ...session.user, role: mode })
}

export function clearSession() {
  session.token = null
  session.user = null
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {}
}

// Apply the user's theme preference to <html> and sync <meta name="theme-color">.
export function applyTheme(theme = session.user?.theme || 'system') {
  const el = document.documentElement
  if (theme === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme)

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', isDark ? '#0D0E11' : '#F4F6FA')
}

// Apply language & RTL direction to <html>.
export function applyLocale(locale = session.user?.locale || 'en') {
  const el = document.documentElement
  el.lang = locale === 'ar' ? 'ar' : 'en'
  el.dir = locale === 'ar' ? 'rtl' : 'ltr'
}

// Initialize the session from the Frappe boot (www/gotrain.py) or a dev lookup.
export function initFromBoot({ user, full_name }) {
  setUser({
    name: session.user?.name || user,
    user,
    email: session.user?.email || user,
    full_name: full_name || session.user?.full_name || user,
    role: session.user?.role || 'client',
    is_coach: session.user?.is_coach || false,
    theme: session.user?.theme || 'system',
    locale: session.user?.locale || 'en',
  })
}
