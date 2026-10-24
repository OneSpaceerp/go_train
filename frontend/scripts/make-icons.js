// Generate PWA manifest icons from the app logo into go_train/public/manifest/.
// Run from frontend/: node scripts/make-icons.js  (needs the `sharp` devDependency)
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(dir, '..', '..', 'go_train', 'public', 'images', 'go_train_logo.png')
const out = path.resolve(dir, '..', '..', 'go_train', 'public', 'manifest')
fs.mkdirSync(out, { recursive: true })
const CORAL = { r: 251, g: 90, b: 95, alpha: 1 }

const any = (size) =>
  sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.join(out, `icon-${size}.png`))

async function maskable(size) {
  const inner = Math.round(size * 0.78)
  const logo = await sharp(src).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: CORAL } })
    .composite([{ input: logo, gravity: 'center' }])
    .png().toFile(path.join(out, `icon-${size}-maskable.png`))
}

await Promise.all([any(192), any(512), maskable(192), maskable(512)])
console.log('manifest icons written to', out)
