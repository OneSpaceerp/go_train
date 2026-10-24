// Copies the built index.html to go_train/www/go_train.html, the page Frappe
// serves at /go-train. A Node script (not `cp`) so the build works on Windows.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const src = '../go_train/public/frontend/index.html'
const dest = '../go_train/www/go_train.html'
mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`copied index.html -> ${dest}`)
