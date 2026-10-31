// Custom Service Worker capabilities for Go Train PWA (PWABuilder & Web Push / Notification / Sync)
// Imported into the Workbox-generated sw.js via workbox.importScripts.

// App shell for offline launch. /gotrain is rendered by Frappe (no-cache, with
// the session's boot data), so navigations go network-first; the last good
// response is kept under one key and served for any /gotrain/* deep link when
// the network is unavailable. The SPA router then resolves the path.
const SHELL_CACHE = 'gotrain-shell-v1'
const SHELL_KEY = '/gotrain'
const SHELL_TIMEOUT_MS = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(SHELL_KEY)).catch(() => {}),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.mode !== 'navigate') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !/^\/gotrain(\/|$)/.test(url.pathname)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic' && !response.redirected) {
          cache.put(SHELL_KEY, response.clone()).catch(() => {})
        }
        return response
      })
      try {
        return await Promise.race([
          network,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SHELL_TIMEOUT_MS)),
        ])
      } catch {
        // Offline or slow network: serve the cached shell, else keep waiting
        const cached = await cache.match(SHELL_KEY)
        return cached || network.catch(() => Response.error())
      }
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (!event.data) return
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  // Allow the foreground app to trigger a system notification through the Service Worker
  // (required on mobile Android/iOS where `new Notification()` is not allowed directly)
  if (event.data.type === 'SHOW_NOTIFICATION') {
    const payload = event.data.payload || {}
    event.waitUntil(
      self.registration.showNotification(payload.title || 'Go Train', {
        body: payload.body || '',
        icon: '/assets/go_train/images/icon-192.png',
        badge: '/assets/go_train/images/icon-192.png',
        tag: payload.tag || 'gotrain-local',
        renotify: Boolean(payload.renotify),
        vibrate: payload.vibrate || [18, 50, 24],
        data: { url: payload.url || '/gotrain' },
      }),
    )
  }
})

// Web Push API handler (RFC 8030 / FCM / VAPID)
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Go Train', body: event.data ? event.data.text() : 'New training update' }
  }
  const title = data.title || data.notification?.title || 'Go Train'
  const body = data.body || data.notification?.body || 'Tap to open your training session.'
  const url = data.url || data.click_action || '/gotrain/notifications'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: data.icon || '/assets/go_train/images/icon-192.png',
      badge: '/assets/go_train/images/icon-192.png',
      tag: data.tag || 'gotrain-push',
      renotify: false,
      vibrate: [20, 40, 20],
      data: { url },
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : undefined,
    }),
  )
})

// Focus existing standalone window on notification tap (prevents tab storms)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/gotrain'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/gotrain') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE_TO', url: targetUrl })
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})

// Background Sync API (Chromium / PWABuilder)
self.addEventListener('sync', (event) => {
  if (event.tag === 'outbox-flush') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'FLUSH_OUTBOX' }))
      }),
    )
  }
})

// Periodic Background Sync API (Installed PWA capability)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'gotrain-daily-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'PERIODIC_SYNC' }))
      }),
    )
  }
})
