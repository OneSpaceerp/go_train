import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { session, isCoach } from './lib/session.js'
import { resolveNavigation, commitNavigation, navDirection } from './lib/nav.js'
import { prefersReducedMotion } from './lib/gestures.js'
import { inbox, sharedText, takeSharedFiles, protocolPath } from './lib/launch.js'

export { navDirection }

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

// The SPA is served by Frappe under /gotrain, so vue-router's base is /gotrain.
// `meta.tab` marks a tab's root screen; every other screen is pushed onto the
// stack of the tab it was opened from (see lib/nav.js).
const routes = [
  { path: '/login', component: () => import('./views/Login.vue'), meta: { public: true, hideTabBar: true } },

  // Athlete tabs
  { path: '/', component: () => import('./views/Train.vue'), meta: { tab: 'train' } },
  { path: '/classes', component: () => import('./views/Classes.vue'), meta: { tab: 'classes' } },
  { path: '/track', component: () => import('./views/Track.vue'), meta: { tab: 'track' } },
  { path: '/messages', component: () => import('./views/Messages.vue'), meta: { tab: 'messages' } },
  { path: '/profile', component: () => import('./views/Profile.vue'), meta: { tab: 'profile' } },

  // Pushed screens
  { path: '/history', component: () => import('./views/History.vue') },
  { path: '/programs', component: () => import('./views/Programs.vue') },
  { path: '/programs/:id', component: () => import('./views/ProgramDetail.vue') },
  // Focused task: logging a workout hides the tab bar for a sticky Save bar
  { path: '/workouts/:id', component: () => import('./views/WorkoutDetail.vue'), meta: { hideTabBar: true } },
  { path: '/threads/:id', component: () => import('./views/Thread.vue'), meta: { hideTabBar: true } },
  // OS entry points (see lib/launch.js)
  {
    path: '/share',
    component: () => import('./views/Messages.vue'),
    beforeEnter: async (to) => {
      inbox.text = sharedText(to.query)
      inbox.files = to.query.files ? await takeSharedFiles() : []
      return { path: '/messages', query: { share: '1' }, replace: true }
    },
  },
  { path: '/open', redirect: (to) => ({ path: protocolPath(to.query.u), query: {} }) },
  { path: '/open-file', redirect: { path: '/messages', query: {} } },
  { path: '/notifications', component: () => import('./views/Notifications.vue') },
  { path: '/exercises', component: () => import('./views/Exercises.vue') },
  { path: '/marketplace', component: () => import('./views/Marketplace.vue') },
  { path: '/gym', component: () => import('./views/Gym.vue') },
  { path: '/promos', component: () => import('./views/Promos.vue') },

  // Coach
  { path: '/coach', component: () => import('./views/CoachClients.vue'), meta: { tab: 'clients', coach: true } },
  { path: '/coach/programs', component: () => import('./views/CoachPrograms.vue'), meta: { tab: 'programs', coach: true } },
]

// Scroll offsets per screen, so returning to a tab or popping back lands
// exactly where the user left it.
const scrollPositions = new Map()
let navInfo = { tab: null, direction: 'none' }
let finishTransition = null

const RESTORES_SCROLL = new Set(['backward', 'swipe-back', 'tab', 'swipe-left', 'swipe-right'])

export const router = createRouter({
  history: createWebHistory('/gotrain'),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // Same screen (back closing a sheet, query-only change): leave scroll alone
    if (to.path === from.path && from.matched.length) return false
    if (savedPosition) return savedPosition
    if (RESTORES_SCROLL.has(navInfo.direction)) {
      return { top: scrollPositions.get(to.fullPath) ?? 0 }
    }
    return { top: 0 }
  },
})

router.beforeEach((to, from) => {
  if (typeof window !== 'undefined' && from.fullPath) {
    scrollPositions.set(from.fullPath, window.scrollY || 0)
  }

  if (!to.meta.public && !session.user) {
    return { path: '/login', query: to.fullPath !== '/' ? { 'redirect-to': to.fullPath } : {} }
  }
  if (to.meta.coach && !isCoach()) return { path: '/' }
  // Coaches have no Train tab: home (app launch, login, shortcuts) is Clients
  if (to.path === '/' && isCoach()) return { path: '/coach', replace: true }

  navInfo = resolveNavigation(to, from, window.history.state?.position ?? 0)
  return true
})

// Directions that animate. Tapping a tab swaps the content instantly, as
// native tab bars do; only pushes, pops and swipes move.
const ANIMATED = new Set(['forward', 'backward', 'swipe-back', 'swipe-left', 'swipe-right'])

function canAnimate(direction) {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    ANIMATED.has(direction) &&
    document.visibilityState === 'visible' &&
    !prefersReducedMotion()
  )
}

// Run the DOM swap inside a View Transition: the browser snapshots the old
// screen, Vue renders the new one, and CSS (style.css) animates between them
// by direction. Unsupported browsers or reduced motion get an instant cut.
router.beforeResolve(() => {
  const { direction } = navInfo
  if (!canAnimate(direction)) return true
  const root = document.documentElement
  root.dataset.nav = direction

  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 300)
    const transition = document.startViewTransition(
      () =>
        new Promise((done) => {
          clearTimeout(fallback)
          finishTransition = done
          resolve(true)
          setTimeout(done, 800) // never freeze the page if a navigation stalls
        }),
    )
    transition.finished.finally(() => {
      if (root.dataset.nav === direction) delete root.dataset.nav
    })
  })
})

router.afterEach((to, _from, failure) => {
  if (!failure) commitNavigation(to, navInfo)
  const done = finishTransition
  finishTransition = null
  // Wait for the new screen to render (and the scroll restore) before the
  // transition takes its "after" snapshot.
  nextTick().then(() => {
    done?.()
    if (!failure) focusScreenHeading()
  })
})

// After a deploy, a running app still references the previous build's
// screen files, which no longer exist on the server; opening a screen it
// hasn't loaded yet fails. Reload once, straight to that screen, to pick up
// the new build. The session flag prevents a reload loop.
const CHUNK_RELOAD_KEY = 'gt-chunk-reload'
const isChunkLoadError = (error) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch|ChunkLoadError/i.test(
    String(error?.message || error),
  )

router.onError((error, to) => {
  finishTransition?.()
  finishTransition = null
  if (!isChunkLoadError(error) || typeof window === 'undefined') return
  let alreadyTried = false
  try {
    alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === to.fullPath
    sessionStorage.setItem(CHUNK_RELOAD_KEY, to.fullPath)
  } catch {}
  if (!alreadyTried) window.location.assign(router.resolve(to).href)
})

router.afterEach((_to, _from, failure) => {
  if (!failure) {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    } catch {}
  }
})

// Move focus to the new screen's title for keyboard and screen-reader users,
// as a native navigation controller does. Touch users are left alone.
function focusScreenHeading() {
  if (typeof document === 'undefined' || document.documentElement.dataset.input !== 'keyboard') return
  const heading = document.querySelector('[data-screen-title]')
  heading?.focus({ preventScroll: true })
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (document.documentElement.dataset.input = 'keyboard'), true)
  window.addEventListener('pointerdown', () => (document.documentElement.dataset.input = 'pointer'), true)
}
