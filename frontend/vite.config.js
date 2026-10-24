import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Frappe serves <app>/public at /assets/<app>/, so the built bundle lives at
// /assets/go_train/frontend/ while the app itself is routed at /gotrain.
const BASE = '/assets/go_train/frontend/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  plugins: [
    vue(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        id: '/gotrain',
        name: 'Go Train',
        short_name: 'Go Train',
        description: 'Programs, workouts, classes and progress for your gym.',
        start_url: '/gotrain',
        scope: '/gotrain',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F4F6FA',
        theme_color: '#FB5A5F',
        lang: 'en',
        dir: 'auto',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: '/assets/go_train/manifest/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/assets/go_train/manifest/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/assets/go_train/manifest/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/assets/go_train/manifest/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,woff2,png,svg}'],
        // The Frappe-rendered bootloader page is never precached.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/method/go_train.'),
            handler: 'NetworkFirst',
            options: { cacheName: 'go-train-api', networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'src') } },
  build: {
    outDir: '../go_train/public/frontend',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
  // Dev: forward everything Frappe owns to the bench so cookies, CSRF and the
  // whitelisted API work while the SPA is served by Vite.
  server: {
    port: 8080,
    allowedHosts: true,
    proxy: {
      '^/(api|assets|files|private|app)': {
        target: process.env.FRAPPE_SITE_URL || 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
}))
