import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Built into go_train/public/frontend so Frappe serves the bundle under
// /assets/go_train/frontend/*, while copy-entry.js copies index.html to
// go_train/www/gotrain.html (served at /gotrain and /gotrain/*).
export default defineConfig({
  base: '/assets/go_train/frontend/',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/gotrain',
        name: 'Go Train — Athlete & Coach',
        short_name: 'Go Train',
        description:
          'Native-grade athlete & coach training, class booking, gym check-in, and PR tracking on ERPNext.',
        start_url: '/gotrain?source=pwa',
        scope: '/gotrain',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        background_color: '#0B0C10',
        theme_color: '#FED14F',
        lang: 'en',
        dir: 'auto',
        categories: ['fitness', 'health', 'sports', 'lifestyle'],
        prefer_related_applications: false,
        launch_handler: {
          client_mode: ['navigate-existing', 'auto'],
        },
        handle_links: 'preferred',
        edge_side_panel: {
          preferred_width: 420,
        },
        icons: [
          {
            src: '/assets/go_train/images/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/go_train/images/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/go_train/images/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/assets/go_train/images/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/assets/go_train/images/icon-monochrome-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome',
          },
        ],
        screenshots: [
          {
            src: '/assets/go_train/images/screenshot-narrow.png',
            sizes: '540x1170',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Go Train Today Session & Set-by-Set Workout Tracker',
          },
          {
            src: '/assets/go_train/images/screenshot-wide.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Go Train Athlete & Coach Dashboard',
          },
        ],
        shortcuts: [
          {
            name: "Today's Workout",
            short_name: 'Train',
            description: 'Jump straight into your scheduled training session',
            url: '/gotrain?source=shortcut-train',
            icons: [{ src: '/assets/go_train/images/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Classes & Check-In',
            short_name: 'Classes',
            description: 'Book a class spot or check in on the gym floor',
            url: '/gotrain/classes?source=shortcut-classes',
            icons: [{ src: '/assets/go_train/images/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Log PR / Benchmark',
            short_name: 'Log PR',
            description: 'Record a new personal record or body metric',
            url: '/gotrain/track?source=shortcut-track',
            icons: [{ src: '/assets/go_train/images/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Workout History',
            short_name: 'History',
            description: 'Search past workout scores and notes',
            url: '/gotrain/history?source=shortcut-history',
            icons: [{ src: '/assets/go_train/images/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Navigations to /gotrain are handled in sw-custom.js (network-first
        // with a cached app shell for offline launch).
        navigateFallback: null,
        // The worker is served from /api/method/go_train.api.pwa.sw, so relative
        // URLs would resolve under /api/method/. Inline the Workbox runtime and
        // make every precache URL absolute so the file can be served verbatim.
        inlineWorkboxRuntime: true,
        modifyURLPrefix: { '': '/assets/go_train/frontend/' },
        importScripts: ['/assets/go_train/frontend/sw-custom.js'],
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            // Never cache authentication endpoints
            urlPattern: ({ url }) => /\/api\/method\/(login|logout|frappe\.auth)/.test(url.pathname),
            handler: 'NetworkOnly',
          },
          {
            // Read-only Go Train PWA APIs: NetworkFirst with 4s timeout and cache fallback
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/method/go_train.api.pwa.'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gotrain-api-v2',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            // Google Fonts (Poppins / Cairo display faces) so titles render offline
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'gotrain-fonts-v1',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Uploaded workout photos/videos and static app images: CacheFirst
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/files/') || url.pathname.startsWith('/assets/go_train/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gotrain-media-v2',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: '../go_train/public/frontend',
    emptyOutDir: true,
  },
})
