// Generate every app icon from the vector logo (go_train/public/images/go_train_logo.svg).
// Run from frontend/: npm run icons  (needs the `sharp` devDependency)
//
//   go_train_logo.png       512  rounded tile (Desk, login, apps screen)
//   icon-192/512.png             rounded tile, purpose "any"
//   icon-maskable-192/512.png    full-bleed yellow, glyph inside the 80% safe zone
//   apple-touch-icon-180.png     opaque square (iOS applies its own mask)
//   icon-monochrome-512.png      white silhouette of the glyph (Android themed icon, badges)
//   favicon-32.png
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const images = path.resolve(dir, '..', '..', 'go_train', 'public', 'images')
const logoSvg = fs.readFileSync(path.join(images, 'go_train_logo.svg'))
const glyphSvg = fs.readFileSync(path.join(images, 'go_train_glyph.svg'))
const SUNSHINE = '#FED14F'

const render = (svg, size) => sharp(svg, { density: Math.ceil((72 * size) / 250) * 2 }).resize(size, size)

// Full-bleed square: yellow background + glyph scaled into the centre
async function square(size, glyphScale, file) {
  const glyph = await render(glyphSvg, Math.round(size * glyphScale)).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: SUNSHINE } })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(path.join(images, file))
}

// Single-colour icon: the OS tints it, so only the glyph's shape (alpha) matters
async function monochrome(size, file) {
  const alpha = await render(glyphSvg, size).ensureAlpha().extractChannel('alpha').raw().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 3, background: '#FFFFFF' } })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toFile(path.join(images, file))
}

await Promise.all([
  render(logoSvg, 512).png().toFile(path.join(images, 'go_train_logo.png')),
  render(logoSvg, 192).png().toFile(path.join(images, 'icon-192.png')),
  render(logoSvg, 512).png().toFile(path.join(images, 'icon-512.png')),
  render(logoSvg, 32).png().toFile(path.join(images, 'favicon-32.png')),
  monochrome(512, 'icon-monochrome-512.png'),
  // The bike spans ~65% of its box; 0.85 keeps it inside the maskable safe circle
  square(192, 0.85, 'icon-maskable-192.png'),
  square(512, 0.85, 'icon-maskable-512.png'),
  square(180, 1, 'apple-touch-icon-180.png'),
])
console.log('icons written to', images)
