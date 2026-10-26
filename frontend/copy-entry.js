// Post-build step: copy the compiled index.html into go_train/www/gotrain.html
// so Frappe serves the SPA at /gotrain (and /gotrain/* via website_route_rules).
// Both {{ csrf_token }} and {{ boot_json | safe }} in index.html are preserved
// for Frappe's Jinja renderer.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../go_train/public/frontend/index.html')
const dest = resolve(here, '../go_train/www/gotrain.html')

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log('Copied', src, '->', dest)
