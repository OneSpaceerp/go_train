// Native Device Capabilities, Permissions, OS Notifications, Screen Wake Lock,
// Web Share API, and Persistent Storage manager (PWABuilder & professional-pwa-builder).
import { ref } from 'vue'
import { haptics } from './haptics.js'

export const capabilities = {
  notifications: typeof window !== 'undefined' && 'Notification' in window,
  push: typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator,
  wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  share: typeof navigator !== 'undefined' && 'share' in navigator,
  vibrate: typeof navigator !== 'undefined' && 'vibrate' in navigator,
  badge: typeof navigator !== 'undefined' && 'setAppBadge' in navigator,
  persist: typeof navigator !== 'undefined' && Boolean(navigator.storage?.persist),
}

export const notificationSupported = capabilities.notifications
export const wakeLockSupported = capabilities.wakeLock

export const notificationPermission = ref(
  capabilities.notifications ? Notification.permission : 'unsupported',
)
export const wakeLockActive = ref(false)
export const storagePersisted = ref(false)
export const storageUsageMb = ref('0.0')

let wakeLockSentinel = null
let wantWakeLock = false

// Sync permission changes live via Permissions API
if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
  navigator.permissions
    .query({ name: 'notifications' })
    .then((status) => {
      notificationPermission.value = status.state === 'prompt' ? 'default' : status.state
      status.onchange = () => {
        notificationPermission.value = status.state === 'prompt' ? 'default' : status.state
      }
    })
    .catch(() => {})
}

// --- Native OS Notifications (via Service Worker Registration) ------------
export async function requestNotificationPermission() {
  if (!capabilities.notifications) {
    return { ok: false, reason: 'unsupported' }
  }
  haptics.tap()
  if (Notification.permission === 'denied') {
    notificationPermission.value = 'denied'
    return { ok: false, reason: 'denied' }
  }
  const result = await Notification.requestPermission()
  notificationPermission.value = result
  if (result === 'granted') {
    haptics.success()
    await sendLocalNotification({
      title: 'Go Train Notifications Enabled',
      body: 'You will receive rest timer alerts, class reminders, and coach updates.',
      tag: 'gotrain-welcome',
      url: '/gotrain/notifications',
    })
    return { ok: true }
  }
  return { ok: false, reason: result }
}

export async function sendLocalNotification({
  title = 'Go Train',
  body = '',
  tag = 'gotrain-alert',
  url = '/gotrain',
  renotify = true,
} = {}) {
  if (!capabilities.notifications || Notification.permission !== 'granted') {
    return false
  }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/gotrain') ||
                  await navigator.serviceWorker.ready
      if (reg?.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: `/assets/go_train/images/icon-192.png?v=${import.meta.env.VITE_ICON_V}`,
          badge: `/assets/go_train/images/icon-192.png?v=${import.meta.env.VITE_ICON_V}`,
          tag,
          renotify,
          vibrate: [20, 50, 30],
          data: { url },
        })
        return true
      }
    }
    new Notification(title, {
      body,
      icon: `/assets/go_train/images/icon-192.png?v=${import.meta.env.VITE_ICON_V}`,
      tag,
    })
    return true
  } catch {
    return false
  }
}

// --- Screen Wake Lock API (keeps display awake during workouts & timers) ---
export async function acquireWakeLock() {
  wantWakeLock = true
  if (!capabilities.wakeLock) return false
  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      wakeLockActive.value = true
      return true
    }
    wakeLockSentinel = await navigator.wakeLock.request('screen')
    wakeLockActive.value = true
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockActive.value = false
    })
    return true
  } catch {
    wakeLockActive.value = false
    return false
  }
}

export async function releaseWakeLock() {
  wantWakeLock = false
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release()
      wakeLockSentinel = null
    }
  } catch {}
  wakeLockActive.value = false
}

export async function toggleWakeLock() {
  haptics.select()
  if (wakeLockActive.value) {
    await releaseWakeLock()
  } else {
    await acquireWakeLock()
  }
  return wakeLockActive.value
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantWakeLock) {
      acquireWakeLock()
    }
  })
}

// --- Native Web Share API (with clipboard fallback) -----------------------
export async function shareContent({ title, text, url }) {
  haptics.tap()
  const shareUrl = url || window.location.href
  if (capabilities.share) {
    try {
      await navigator.share({ title, text, url: shareUrl })
      return { shared: true, method: 'native' }
    } catch (err) {
      if (err?.name === 'AbortError') return { shared: false, method: 'cancelled' }
    }
  }
  try {
    await navigator.clipboard.writeText(`${title ? title + ' — ' : ''}${text ? text + ' ' : ''}${shareUrl}`)
    haptics.success()
    return { shared: true, method: 'clipboard' }
  } catch {
    return { shared: false, method: 'none' }
  }
}

// --- Persistent Offline Storage -------------------------------------------
export async function initStoragePersistence() {
  if (typeof navigator === 'undefined' || !navigator.storage) return
  try {
    if (navigator.storage.persisted) {
      storagePersisted.value = await navigator.storage.persisted()
    }
    if (!storagePersisted.value && navigator.storage.persist) {
      storagePersisted.value = await navigator.storage.persist()
    }
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate()
      if (est?.usage != null) {
        storageUsageMb.value = (est.usage / (1024 * 1024)).toFixed(2)
      }
    }
  } catch {}
}
