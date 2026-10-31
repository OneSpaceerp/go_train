// Native PWA runtime: online/offline awareness, controlled Service Worker update
// lifecycle, Visual Viewport keyboard tracking, install prompt handling, app
// badging, local-first read-through cache, idempotent offline queue, and logout purge.
import { ref, computed } from 'vue'
import { haptics } from './haptics.js'

const CACHE_PREFIX = 'gt-cache:v2:'
const QUEUE_KEY = 'gt-offline-queue:v1'
const FAILED_KEY = 'gt-offline-failed:v1'
const MAX_ATTEMPTS = 5
const INSTALL_DISMISSED_KEY = 'gt-install-dismissed'

export const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
export const deferredInstallPrompt = ref(null)
export const installDismissed = ref(Boolean(localStorage.getItem(INSTALL_DISMISSED_KEY)))
export const unreadNotifications = ref(0)
export const pendingSyncCount = ref(readQueue().length)
// Queued changes the server rejected (or that kept failing); kept so the
// athlete is told instead of the change vanishing.
export const syncFailures = ref(readList(FAILED_KEY))
export const swUpdateAvailable = ref(false)
export const keyboardOpen = ref(false)

let waitingWorker = null
let reloadingForSw = false

export const isStandalone = computed(() => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true
  )
})

export const isIos = computed(() => {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
})

export const isIosSafari = computed(() => {
  if (!isIos.value || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /safari/i.test(ua) && !/crios|fxios|opios|edgios/i.test(ua)
})

export const canPromptInstall = computed(() => {
  if (isStandalone.value || installDismissed.value) return false
  return Boolean(deferredInstallPrompt.value) || isIos.value
})
export const canInstall = canPromptInstall

export function dismissInstallBanner() {
  installDismissed.value = true
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()))
  } catch {}
}

export async function triggerInstallPrompt() {
  if (!deferredInstallPrompt.value) return { outcome: 'ios-manual' }
  const promptEvent = deferredInstallPrompt.value
  promptEvent.prompt()
  const choice = await promptEvent.userChoice.catch(() => ({ outcome: 'dismissed' }))
  deferredInstallPrompt.value = null
  if (choice.outcome === 'accepted') dismissInstallBanner()
  return choice
}
export const promptInstall = triggerInstallPrompt

export function setUnreadBadge(count) {
  const n = Math.max(0, Number(count) || 0)
  unreadNotifications.value = n
  try {
    if ('setAppBadge' in navigator) {
      if (n > 0) navigator.setAppBadge(n).catch(() => {})
      else navigator.clearAppBadge?.().catch(() => {})
    }
  } catch {}
}

// --- Controlled Service Worker Registration & Update Lifecycle ------------
export function registerPwaServiceWorker(router) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  // main.js calls this after async boot work, often after `load` has fired
  const onLoad = async () => {
    try {
      // index.html starts the registration; fall back for pages without it (tests, dev)
      const reg = await (window.goTrainSW ||
        navigator.serviceWorker.register('/api/method/go_train.api.pwa.sw', { scope: '/gotrain' }))

      if (reg.waiting) {
        waitingWorker = reg.waiting
        swUpdateAvailable.value = true
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = installing
            swUpdateAvailable.value = true
          }
        })
      })

      // Check hourly so long-running home-screen apps receive updates
      setInterval(() => {
        reg.update().catch(() => {})
      }, 60 * 60 * 1000)
    } catch {}
  }
  if (document.readyState === 'complete') onLoad()
  else window.addEventListener('load', onLoad)

  // Reload only when an update replaces a running worker. On a first visit the
  // new worker claims the page (clientsClaim) and there is nothing to refresh.
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForSw || !hadController) return
    reloadingForSw = true
    window.location.reload()
  })

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data
    if (!data) return
    if (data.type === 'NAVIGATE_TO' && data.url && router) {
      const rel = data.url.replace(/^.*\/gotrain/, '') || '/'
      router.push(rel)
    } else if (data.type === 'FLUSH_OUTBOX') {
      window.dispatchEvent(new CustomEvent('online'))
    }
  })
}

export function applySwUpdate() {
  haptics.medium()
  swUpdateAvailable.value = false
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  } else {
    window.location.reload()
  }
}

// --- Visual Viewport Keyboard Tracking (iOS & Android) --------------------
export function initVisualViewportKeyboard() {
  if (typeof window === 'undefined') return
  const vv = window.visualViewport
  if (vv) {
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        const isOpen = inset > 80
        keyboardOpen.value = isOpen
        document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
        document.documentElement.classList.toggle('keyboard-open', isOpen)
      })
    }
    vv.addEventListener('resize', update, { passive: true })
    vv.addEventListener('scroll', update, { passive: true })
    update()
  }

  // Keep focused inputs visible above the virtual keyboard on iOS WebKit
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      setTimeout(() => {
        try {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        } catch {}
      }, 220)
    }
  })
}

// --- Read-through local cache for instant & offline reads -----------------
export function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw).data
  } catch {
    return null
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

// --- Complete Cache & Storage Purge on Logout (Shared-Device Safety) ------
export async function purgeAllCachesOnLogout() {
  try {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith(CACHE_PREFIX) || k === QUEUE_KEY || k === FAILED_KEY)) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
    pendingSyncCount.value = 0
    syncFailures.value = []
  } catch {}

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheNames = await window.caches.keys()
      // gotrain-api-*, gotrain-media-* and gotrain-shell-* hold per-user data
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('gotrain-'))
          .map((name) => window.caches.delete(name)),
      )
    }
  } catch {}

  setUnreadBadge(0)
}

// --- Offline mutation queue with idempotency keys -------------------------
// Each queued body carries `client_op_id` and `client_time` (see api.js); the
// server uses them to dedupe replays and to keep the original date.
function readList(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function readQueue() {
  return readList(QUEUE_KEY)
}

function saveQueue(list) {
  pendingSyncCount.value = list.length
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list))
  } catch {}
}

function saveFailures(list) {
  syncFailures.value = list
  try {
    localStorage.setItem(FAILED_KEY, JSON.stringify(list))
  } catch {}
}

export function dismissSyncFailures() {
  saveFailures([])
}

export function enqueueOfflineMutation(item) {
  const q = readQueue()
  const id = item.body?.client_op_id || `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  q.push({ id, ...item, attempts: 0, queuedAt: Date.now() })
  saveQueue(q)
  // Request Background Sync on Chromium if supported
  try {
    navigator.serviceWorker?.ready
      .then((reg) => reg.sync?.register?.('outbox-flush'))
      .catch(() => {})
  } catch {}
}

// Errors worth retrying later: offline, signed out (retry after sign-in),
// timeouts, rate limits and server errors. Anything else (e.g. a validation
// error) will never succeed, so it moves to the failures list.
function isTransient(err) {
  const status = err?.status || 0
  return err?.network || !status || [401, 403, 408, 429].includes(status) || status >= 500
}

let flushing = null

// Replays queued mutations in order. Concurrent calls share one run.
export function flushOfflineQueue(runner) {
  if (flushing) return flushing
  flushing = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const q = readQueue()
    if (!q.length) return
    const failures = readList(FAILED_KEY)
    let remaining = []
    for (let i = 0; i < q.length; i++) {
      const item = q[i]
      try {
        await runner(item)
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1
        item.lastError = err?.message || 'Sync failed'
        if (!isTransient(err) || item.attempts >= MAX_ATTEMPTS) {
          failures.push(item)
          continue // a permanent failure doesn't block the rest of the queue
        }
        remaining = q.slice(i) // preserve causal order: stop on a transient failure
        break
      }
    }
    saveQueue(remaining)
    if (failures.length !== syncFailures.value.length) saveFailures(failures)
    if (remaining.length === 0) haptics.success()
  })().finally(() => {
    flushing = null
  })
  return flushing
}

// --- Wire browser events once ---------------------------------------------
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline.value = true
  })
  window.addEventListener('offline', () => {
    isOnline.value = false
  })
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstallPrompt.value = e
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt.value = null
    dismissInstallBanner()
  })
}
