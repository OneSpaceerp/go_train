import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { applyTheme, applyLocale, initFromBoot, setUser } from './lib/session.js'
import { api } from './lib/api.js'
import { dismissSplash } from './lib/splash.js'
import './style.css'

// Register the PWA service worker served from go_train.api.pwa.sw with
// Service-Worker-Allowed: /gotrain so it controls /gotrain and all subroutes.
function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/api/method/go_train.api.pwa.sw', { scope: '/gotrain' })
        .catch(() => {})
    })
  }
}

async function start() {
  let user = null
  let fullName = ''
  try {
    const boot = JSON.parse(document.getElementById('go-train-boot')?.textContent || '{}')
    if (boot.user && boot.user !== 'Guest' && !String(boot.user).includes('{{')) {
      user = boot.user
      fullName = boot.full_name || ''
    }
  } catch { /* dev: literal braces */ }

  if (!user) {
    try {
      const r = await fetch('/api/method/frappe.auth.get_logged_user', { credentials: 'same-origin' })
      const d = await r.json()
      if (d.message && d.message !== 'Guest') user = d.message
    } catch { /* offline / not logged in */ }
  }

  // If signed in, seed the session and hydrate full profile/coach context.
  if (user) {
    initFromBoot({ user, full_name: fullName })
    try {
      const me = await api.get('/auth/me')
      if (me?.user) setUser(me.user)
    } catch { /* offline fallback uses cached user */ }
  }

  applyTheme()
  applyLocale()
  createApp(App).use(router).mount('#app')
  registerServiceWorker()

  // Let the multi-stage launch choreography finish before revealing the app.
  dismissSplash()
}

start()
