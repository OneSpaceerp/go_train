// Platform hints for adaptive styling only (back chevron vs. arrow, title
// alignment). Capabilities are always feature-detected, never inferred from this.

function detect() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  // iPadOS reports itself as a Mac with touch support
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

export const platform = detect()
export const isIosLike = platform === 'ios'

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false
  return (
    ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    ) || window.navigator.standalone === true
  )
}

/** Expose platform + install context to CSS as data attributes on <html>. */
export function applyPlatformAttributes() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.os = platform
  root.dataset.standalone = String(isStandaloneDisplay())
}
