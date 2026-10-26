// Native-grade tactile & acoustic feedback aligned with Apple HIG (playing-haptics.md).
// Respects prefers-reduced-motion and degrades gracefully on devices without Vibration API.

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function vibrate(pattern) {
  if (prefersReducedMotion()) return
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {}
}

export const haptics = {
  /** Subtle selection tick (tab switch, day pick, RPE selection) */
  select() {
    vibrate(8)
  },
  /** Light impact (button press, sheet open, toggle) */
  tap() {
    vibrate(12)
  },
  /** Medium impact (completing a set, starting/stopping timer) */
  medium() {
    vibrate(22)
  },
  /** Success pattern (workout logged, class booked, check-in confirmed, PR saved) */
  success() {
    vibrate([14, 45, 24])
  },
  /** Warning pattern (cancelling booking, clearing timer) */
  warning() {
    vibrate([22, 60, 18])
  },
  /** Error pattern (validation error, network failure) */
  error() {
    vibrate([30, 50, 30, 50, 40])
  },
  /** Synthesized subtle chime + haptic pulse when a rest/countdown timer finishes */
  timerComplete() {
    vibrate([35, 70, 35, 70, 60])
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const now = ctx.currentTime
      const notes = [880, 1108.73, 1318.51] // A5 - C#6 - E6 triad
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now + i * 0.11)
        gain.gain.setValueAtTime(0.0001, now + i * 0.11)
        gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.11 + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.28)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + i * 0.11)
        osc.stop(now + i * 0.11 + 0.3)
      })
    } catch {}
  },
}
