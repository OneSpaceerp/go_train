// Write android-settings.json for packaging the Play Store app with PWABuilder
// (PWABuilder Studio → Package → Android → advanced settings, or pwabuilder.com).
// Run from frontend/ after a build:
//   npm run android-settings -- https://gym.example.com [com.gotrain.app] [1.0.0] [1]
// Arguments: site URL (https, no path), package ID, version name, version code.
// Bump the version code by 1 for every upload to Google Play.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [site, packageId = 'com.gotrain.app', appVersion = '1.0.0', versionCode = '1'] = process.argv.slice(2)
let host
try {
  host = new URL(site)
} catch {
  console.error('Usage: npm run android-settings -- https://your-domain [packageId] [version] [versionCode]')
  process.exit(1)
}
if (host.protocol !== 'https:') {
  console.error('The site must use https:// — Android only trusts HTTPS for full-screen apps.')
  process.exit(1)
}
const origin = host.origin

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '..', '..')
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'go_train', 'public', 'frontend', 'manifest.webmanifest'), 'utf8'),
)
const abs = (src) => new URL(src, origin).href
const icon = (purpose) => manifest.icons.find((i) => i.purpose === purpose && i.sizes === '512x512')

// The app paints its own light or dark background, so system bars follow it
const LIGHT = '#F4F6FA'
const DARK = '#0B0C10'

const settings = {
  appVersion,
  appVersionCode: Number(versionCode),
  backgroundColor: manifest.background_color,
  display: manifest.display,
  enableNotifications: true,
  enableSiteSettingsShortcut: true,
  fallbackType: 'customtabs',
  features: { locationDelegation: { enabled: false }, playBilling: { enabled: false } },
  host: origin,
  iconUrl: abs(icon('any').src),
  maskableIconUrl: abs(icon('maskable').src),
  monochromeIconUrl: abs(icon('monochrome').src),
  includeSourceCode: false,
  isChromeOSOnly: false,
  launcherName: manifest.short_name,
  name: manifest.short_name,
  navigationColor: LIGHT,
  navigationColorDark: DARK,
  navigationDividerColor: LIGHT,
  navigationDividerColorDark: DARK,
  orientation: 'portrait',
  packageId,
  shortcuts: manifest.shortcuts.map((s) => ({
    ...s,
    icons: s.icons.map((i) => ({ ...i, src: abs(i.src) })),
  })),
  signing: {
    file: null,
    alias: 'gotrain',
    fullName: 'Go Train',
    organization: 'Go Train',
    organizationalUnit: 'Engineering',
    countryCode: 'EG',
    keyPassword: '',
    storePassword: '',
  },
  signingMode: 'new',
  splashScreenFadeOutDuration: 300,
  startUrl: '/gotrain?source=twa',
  themeColor: LIGHT,
  themeColorDark: DARK,
  shareTarget: manifest.share_target || [],
  webManifestUrl: abs('/assets/go_train/frontend/manifest.webmanifest'),
}

const out = path.join(root, 'android-settings.json')
fs.writeFileSync(out, JSON.stringify(settings, null, 2) + '\n', 'utf8')
console.log('Wrote', out)
