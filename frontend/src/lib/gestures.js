// Shared helpers for touch gestures (edge-swipe back, swipe between tabs,
// sheet drag-to-dismiss).

/** Tracks recent touch samples to estimate release velocity in px/ms. */
export function velocityTracker(windowMs = 90) {
  let samples = []
  return {
    reset() {
      samples = []
    },
    add(x, y, time = performance.now()) {
      samples.push({ x, y, time })
      while (samples.length > 2 && time - samples[0].time > windowMs) samples.shift()
    },
    velocity() {
      if (samples.length < 2) return { x: 0, y: 0 }
      const first = samples[0]
      const last = samples[samples.length - 1]
      const dt = Math.max(1, last.time - first.time)
      return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }
    },
  }
}

const FORM_CONTROL = 'input, textarea, select, [contenteditable="true"], [data-no-swipe]'

/**
 * True when a horizontal swipe starting at `target` belongs to something else:
 * a form control (sliders, text selection) or a horizontally scrollable strip.
 */
export function horizontalGestureClaimed(target, boundary = document.body) {
  if (!(target instanceof Element)) return false
  if (target.closest(FORM_CONTROL)) return true
  for (let el = target; el && el !== boundary; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
  }
  return false
}

/** Rubber-band resistance past a limit, like iOS overscroll. */
export function rubberBand(distance, dimension, constant = 0.55) {
  const sign = Math.sign(distance)
  const d = Math.abs(distance)
  return sign * ((d * dimension * constant) / (dimension + constant * d))
}

export const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Touch handlers for a horizontal flick between in-screen pages (e.g. the
 * segments of a segmented control). Calls `onSwipe('left' | 'right')`.
 * Ignores swipes from the screen edges (back gesture) and claimed areas.
 * Bind `onTouchmove` non-passively: once the swipe locks horizontal it cancels
 * the touchmoves, so the page doesn't scroll or fling underneath it.
 */
export function swipeHandlers(onSwipe, { distance = 56, edge = 24 } = {}) {
  let start = null
  let horizontal = null
  return {
    onTouchmove(e) {
      if (!start || e.touches.length !== 1) return
      const touch = e.touches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horizontal = Math.abs(dx) > Math.abs(dy) * 1.15
      if (horizontal === false) start = null
      else if (horizontal && e.cancelable) e.preventDefault()
    },
    onTouchstart(e) {
      const touch = e.touches[0]
      const nearEdge = touch.clientX <= edge || window.innerWidth - touch.clientX <= edge
      horizontal = null
      start = e.touches.length === 1 && !nearEdge && !horizontalGestureClaimed(e.target) ? touch : null
      if (start) start = { x: touch.clientX, y: touch.clientY, t: performance.now() }
    },
    onTouchend(e) {
      if (!start) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const fast = Math.abs(dx) / Math.max(1, performance.now() - start.t) > 0.35
      start = null
      if (Math.abs(dx) > Math.abs(dy) * 1.4 && (Math.abs(dx) > distance || (fast && Math.abs(dx) > 24))) {
        onSwipe(dx < 0 ? 'left' : 'right')
      }
    },
  }
}
