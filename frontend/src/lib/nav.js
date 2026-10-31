// Native navigation model.
//
// Like a native tab bar app, each tab owns a navigation stack: switching tabs
// returns to where you left that tab, tapping the active tab pops it to its
// root (or scrolls to top when already there), and pushed screens stay inside
// the tab you opened them from. The direction of every navigation is derived
// here so the router can animate it (push, pop, tab switch, swipe).
import { ref, computed } from 'vue'
import { isCoach } from './session.js'
import { t } from './i18n.js'
import { unreadNotifications } from './pwa.js'

const ATHLETE_TABS = [
  { tab: 'train', root: '/', labelKey: 'tab.train', icon: 'train' },
  { tab: 'classes', root: '/classes', labelKey: 'tab.classes', icon: 'calendar' },
  { tab: 'track', root: '/track', labelKey: 'tab.track', icon: 'track' },
  { tab: 'messages', root: '/messages', labelKey: 'tab.messages', icon: 'message' },
  { tab: 'profile', root: '/profile', labelKey: 'tab.profile', icon: 'profile' },
]

const COACH_TABS = [
  { tab: 'clients', root: '/coach', labelKey: 'tab.clients', icon: 'clients' },
  { tab: 'programs', root: '/coach/programs', labelKey: 'tab.programs', icon: 'programs' },
  { tab: 'messages', root: '/messages', labelKey: 'tab.messages', icon: 'message' },
  { tab: 'profile', root: '/profile', labelKey: 'tab.profile', icon: 'profile' },
]

export const tabs = computed(() =>
  (isCoach() ? COACH_TABS : ATHLETE_TABS).map((item) => ({
    ...item,
    label: t(item.labelKey),
    badge: item.tab === 'profile' ? unreadNotifications.value : 0,
  })),
)

/** Tab whose stack the current screen belongs to. */
export const currentTab = ref(null)

/**
 * How the last navigation moved, for transitions:
 * forward | backward | tab | swipe-left | swipe-right | swipe-back | none
 */
export const navDirection = ref('none')

const lastPathByTab = new Map()
const titleByPath = new Map()
let pending = null // { tab?, direction? } for the next navigation
let lastPosition = typeof window !== 'undefined' ? (window.history.state?.position ?? 0) : 0

export const tabIndex = (tab) => tabs.value.findIndex((item) => item.tab === tab)
export const tabByName = (tab) => tabs.value.find((item) => item.tab === tab) || null

/** Root path of the tab a screen lives in, used to decide back vs. pop-to-root. */
export const isTabRoot = (route) => Boolean(route?.meta?.tab)

/**
 * Called from router.beforeEach. Works out which tab the destination belongs
 * to and which way the navigation moves. `historyPosition` is
 * window.history.state.position at guard time: during a push it is still the
 * current entry, during back/forward it is already the destination.
 */
export function resolveNavigation(to, from, historyPosition = lastPosition) {
  const isPop = historyPosition !== lastPosition
  const delta = historyPosition - lastPosition
  const prevTab = currentTab.value

  let nextTab =
    pending?.tab ||
    (isPop ? (typeof window !== 'undefined' ? window.history.state?.gtTab : null) : null) ||
    to.meta?.tab ||
    (to.meta?.public ? null : prevTab) ||
    tabs.value[0]?.tab ||
    null

  let direction
  if (pending?.direction) direction = pending.direction
  else if (!from?.matched?.length) direction = 'none' // first load
  else if (from.fullPath === to.fullPath) direction = 'none' // e.g. back closing a sheet
  else if (prevTab && nextTab && prevTab !== nextTab) direction = 'tab'
  else if (isPop) direction = delta < 0 ? 'backward' : 'forward'
  else direction = 'forward'

  pending = null
  if (isPop) lastPosition = historyPosition
  return { tab: nextTab, direction }
}

/** Called from router.afterEach once the navigation is committed. */
export function commitNavigation(to, { tab, direction }) {
  currentTab.value = tab
  navDirection.value = direction
  if (typeof window !== 'undefined') {
    lastPosition = window.history.state?.position ?? lastPosition
    // Remember the owning tab on the history entry so back/forward restores it
    try {
      if (window.history.state && window.history.state.gtTab !== tab) {
        window.history.replaceState({ ...window.history.state, gtTab: tab }, '')
      }
    } catch {}
  }
  if (tab && !to.meta?.public) lastPathByTab.set(tab, to.fullPath)
}

/** Screens register their title so the back button can name the previous screen. */
export function registerTitle(path, title) {
  if (path && title) titleByPath.set(path, title)
}

export function titleForPath(path) {
  return path ? titleByPath.get(path) || '' : ''
}

/** Override the tab and/or animation of the next navigation. */
export function setNextNavigation(next) {
  pending = { ...(pending || {}), ...next }
}

/**
 * Tab bar behaviour:
 * - another tab → that tab's last screen
 * - the active tab while deeper in its stack → pop to the tab's root
 * - the active tab at its root → scroll to top
 * Returns what happened, for haptics and tests.
 */
export function goTab(router, tab, { direction } = {}) {
  const target = tabByName(tab)
  if (!target) return 'none'
  const route = router.currentRoute.value

  if (tab === currentTab.value) {
    if (route.fullPath !== target.root) {
      setNextNavigation({ tab, direction: direction || 'backward' })
      lastPathByTab.set(tab, target.root)
      router.push(target.root)
      return 'pop-to-root'
    }
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return 'scroll-top'
    }
    return 'none'
  }

  setNextNavigation({ tab, direction: direction || 'tab' })
  router.push(lastPathByTab.get(tab) || target.root)
  return 'switch'
}

/** The tab next to the current one in visual order (`step` is +1 / -1). */
export function adjacentTab(step) {
  const i = tabIndex(currentTab.value)
  if (i < 0) return null
  return tabs.value[i + step] || null
}

/** Test hook: reset module state between tests. */
export function _resetNav() {
  currentTab.value = null
  navDirection.value = 'none'
  lastPathByTab.clear()
  titleByPath.clear()
  pending = null
  lastPosition = 0
}
