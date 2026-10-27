import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { applyTheme, applyLocale, initFromBoot, setUser } from './lib/session.js'
import { api } from './lib/api.js'
import { dismissSplash } from './lib/splash.js'
import { registerPwaServiceWorker, initVisualViewportKeyboard } from './lib/pwa.js'
import { initStoragePersistence } from './lib/permissions.js'
import './style.css'

async function start() {
  initVisualViewportKeyboard()

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
    initStoragePersistence()
  }

  applyTheme()
  applyLocale()
  createApp(App).use(router).mount('#app')
  registerPwaServiceWorker(router)

  // Let the multi-stage launch choreography finish before revealing the app.
  dismissSplash()
}

start()
