// The launch screen is plain HTML and CSS in index.html, so it paints on frame 1
// before this bundle loads. This module coordinates its dismissal so the full
// ~3.4s 4-stage athletic choreography completes smoothly before revealing the app.

import { applyTheme } from './session.js'

const FULL_MS = 3400
const BRIEF_MS = 250 // reduced motion: skip waiting for the choreography

/** Hide the launch screen once the app is ready and the animation has had its time. */
export function dismissSplash() {
  const el = document.querySelector('[data-splash]')
  if (!el) return Promise.resolve()

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const minimum = reduced ? BRIEF_MS : FULL_MS
  const wait = Math.max(0, minimum - performance.now())

  return new Promise((resolve) => {
    setTimeout(() => {
      el.classList.add('splash-out')
      el.setAttribute('aria-hidden', 'true')
      setTimeout(() => {
        el.remove()
        applyTheme()
        resolve()
      }, 700)
    }, wait)
  })
}
