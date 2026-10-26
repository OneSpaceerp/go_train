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
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        id: '/gotrain',
        name: 'Go Train — Athlete & Coach',
        short_name: 'Go Train',
        description: 'Programs, workouts, class booking, and progress tracking on ERPNext.',
        start_url: '/gotrain',
        scope: '/gotrain',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#070510',
        theme_color: '#F23D46',
        icons: [
          { src: '/assets/go_train/images/go_train_logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}'],
      },
    }),
  ],
  build: {
    outDir: '../go_train/public/frontend',
    emptyOutDir: true,
  },
})
