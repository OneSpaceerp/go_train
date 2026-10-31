// Post-build step:
// 1. Copy the compiled index.html into go_train/www/gotrain.html so Frappe serves
//    the SPA at /gotrain (and /gotrain/* via website_route_rules).
// 2. Verify sw.js only uses absolute URLs. It is served from
//    /api/method/go_train.api.pwa.sw, where relative URLs would 404; vite.config.js
//    inlines the Workbox runtime and prefixes precache URLs; the web manifest
//    entry is added by vite-plugin-pwa after that step, so it is prefixed here.
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
  const sw = readFileSync(swPath, 'utf8').replace(
    /url:"manifest\.webmanifest"/g,
    'url:"/assets/go_train/frontend/manifest.webmanifest"',
  )
  writeFileSync(swPath, sw, 'utf8')
  const relative = sw.match(/url:"(?!\/)[^"]+"|define\(\["\.\//)
  if (relative) {
    console.error('sw.js contains a relative URL that will 404 when served from /api/method:', relative[0])
    process.exit(1)
  }
  console.log('Verified absolute URLs in', swPath)
}
