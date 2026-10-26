// Native PWA runtime state: online/offline awareness, install prompt handling,
// iOS standalone detection, app badging, and local-first read-through cache + queue.
import { ref, computed } from 'vue'

const CACHE_PREFIX = 'gt-cache:v2:'
const QUEUE_KEY = 'gt-offline-queue:v1'
const INSTALL_DISMISSED_KEY = 'gt-install-dismissed'

export const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
export const deferredInstallPrompt = ref(null)
export const installDismissed = ref(Boolean(localStorage.getItem(INSTALL_DISMISSED_KEY)))
export const unreadNotifications = ref(0)
export const pendingSyncCount = ref(readQueue().length)

export const isStandalone = computed(() => {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
})

export const isIos = computed(() => {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
})

export const canPromptInstall = computed(() => {
  if (isStandalone.value || installDismissed.value) return false
  return Boolean(deferredInstallPrompt.value) || isIos.value
})

export function dismissInstallBanner() {
  installDismissed.value = true
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
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

// --- Offline mutation queue -----------------------------------------------
function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(list) {
  pendingSyncCount.value = list.length
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list))
  } catch {}
}

export function enqueueOfflineMutation(item) {
  const q = readQueue()
  q.push({ ...item, queuedAt: Date.now() })
  saveQueue(q)
}

export async function flushOfflineQueue(runner) {
  if (!isOnline.value) return
  const q = readQueue()
  if (!q.length) return
  const remaining = []
  for (const item of q) {
    try {
      await runner(item)
    } catch {
      remaining.push(item)
    }
  }
  saveQueue(remaining)
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
