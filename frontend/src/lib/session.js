// Auth session: token + current user, kept in a reactive store and localStorage.
import { reactive } from 'vue'

const TOKEN_KEY = 'go-train-token'
const USER_KEY = 'go-train-user'

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }

export const session = reactive({
  token: (() => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } })(),
  user: read(USER_KEY),
})

export const getToken = () => session.token
export const isCoach = () => session.user?.role === 'coach'

export function setSession(token, user) {
  session.token = token
  session.user = user
  try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)) } catch {}
}

export function setUser(user) {
  session.user = user
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)) } catch {}
}

export function clearSession() {
  session.token = null
  session.user = null
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) } catch {}
}

// Apply the user's theme preference to <html>.
export function applyTheme(theme = session.user?.theme || 'system') {
  const el = document.documentElement
  if (theme === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme)
}
