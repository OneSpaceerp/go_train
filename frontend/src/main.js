import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { applyTheme, initFromBoot } from './lib/session.js'
import './style.css'

// Auth is the Frappe session. In production the bootloader (www/gotrain.py)
// injects #go-train-boot with the logged-in user; in Vite dev that's literal
// Jinja, so we fall back to asking Frappe who is logged in.
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

  if (!user) {
    window.location.assign(`/login?redirect-to=${encodeURIComponent('/gotrain')}`)
    return
  }

  initFromBoot({ user, full_name: fullName })
  applyTheme()
  createApp(App).use(router).mount('#app')

  // Fade out the launch screen once the app is up.
  const splash = document.querySelector('[data-splash]')
  if (splash) { splash.classList.add('splash-out'); setTimeout(() => splash.remove(), 600) }
}

start()
