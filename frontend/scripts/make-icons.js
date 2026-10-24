// Generate PWA icons from public/logo.png using sharp.
// 192/512 "any" are the logo as-is; maskable variants add coral padding so the
// safe zone isn't clipped by Android's mask.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const pub = path.resolve(dir, '..', 'public')
const out = path.join(pub, 'icons')
fs.mkdirSync(out, { recursive: true })
const src = path.join(pub, 'logo.png')
const CORAL = { r: 251, g: 90, b: 95, alpha: 1 }

async function any(size) {
  await sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.join(out, `icon-${size}.png`))
}
async function maskable(size) {
  const inner = Math.round(size * 0.78)
  const logo = await sharp(src).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: CORAL } })
    .composite([{ input: logo, gravity: 'center' }])
    .png().toFile(path.join(out, `icon-${size}-maskable.png`))
}

await Promise.all([any(192), any(512), any(96), maskable(192), maskable(512)])
console.log('icons written to', out)
