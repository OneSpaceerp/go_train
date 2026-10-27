// Post-build step:
// 1. Copy the compiled index.html into go_train/www/gotrain.html so Frappe serves
//    the SPA at /gotrain (and /gotrain/* via website_route_rules).
// 2. Normalize relative asset URLs inside go_train/public/frontend/sw.js to
//    /assets/go_train/frontend/* so the Service Worker served from
//    /api/method/go_train.api.pwa.sw (with Service-Worker-Allowed: /gotrain)
//    resolves Workbox and precached chunks without 404s.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../go_train/public/frontend')
const src = resolve(outDir, 'index.html')
const dest = resolve(here, '../go_train/www/gotrain.html')
const swPath = resolve(outDir, 'sw.js')

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log('Copied', src, '->', dest)

if (existsSync(swPath)) {
  const BASE = '/assets/go_train/frontend/'
  let sw = readFileSync(swPath, 'utf8')
  sw = sw
    .replace(/define\(\["\.\/workbox-/g, `define(["${BASE}workbox-`)
    .replace(/url:"assets\//g, `url:"${BASE}assets/`)
    .replace(/url:"manifest\.webmanifest"/g, `url:"${BASE}manifest.webmanifest"`)
    .replace(/url:"sw-custom\.js"/g, `url:"${BASE}sw-custom.js"`)
  writeFileSync(swPath, sw, 'utf8')
  console.log('Normalized absolute asset paths in', swPath)
}
