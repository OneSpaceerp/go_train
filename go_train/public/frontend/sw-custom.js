// Custom Service Worker capabilities for Go Train PWA (PWABuilder & Web Push / Notification / Sync)
// Imported into the Workbox-generated sw.js via workbox.importScripts.

// App shell for offline launch. /gotrain is rendered by Frappe (no-cache, with
// the session's boot data), so navigations go network-first; the last good
// response is kept under one key and served for any /gotrain/* deep link when
// the network is unavailable. The SPA router then resolves the path.
const SHELL_CACHE = 'gotrain-shell-v1'
const SHELL_KEY = '/gotrain'
const SHELL_TIMEOUT_MS = 4000

// Runtime image caches are versioned in vite.config.js; remove older ones so
// stale icons (pre-hash URLs) are not served from cache
const MEDIA_CACHE = 'gotrain-media-v3'
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('gotrain-media-') && k !== MEDIA_CACHE).map((k) => caches.delete(k))),
      ),
  )
})

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(SHELL_KEY)).catch(() => {}),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.mode !== 'navigate' || request.method !== 'GET') return
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

// Share sheet (manifest share_target, POST multipart). Stash the photos and
// videos for the page (lib/launch.js reads SHARE_CACHE) and redirect to the
// share screen with the text fields, so the athlete can pick a conversation.
const SHARE_CACHE = 'gotrain-share-inbox'
const MAX_SHARED_FILES = 5

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'POST') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname !== '/gotrain/share') return

  event.respondWith(
    (async () => {
      const params = new URLSearchParams()
      try {
        const form = await request.formData()
        for (const key of ['title', 'text', 'url']) {
          const value = form.get(key)
          if (value) params.set(key, String(value))
        }
        const files = form.getAll('media').filter((f) => f && typeof f !== 'string').slice(0, MAX_SHARED_FILES)
        const cache = await caches.open(SHARE_CACHE)
        await Promise.all((await cache.keys()).map((key) => cache.delete(key)))
        await Promise.all(
          files.map((file, i) =>
            cache.put(
              `/gotrain/share-inbox/${i}`,
              new Response(file, {
                headers: {
                  'content-type': file.type || 'application/octet-stream',
                  'x-file-name': encodeURIComponent(file.name || `shared-${i + 1}`),
                },
              }),
            ),
          ),
        )
        if (files.length) params.set('files', String(files.length))
      } catch {
        // Unreadable share: still open the app on the share screen
      }
      return Response.redirect(`/gotrain/share?${params}`, 303)
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
