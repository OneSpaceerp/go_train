import { ref } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { session, isCoach } from './lib/session.js'

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

export const navDirection = ref('tab') // 'tab' | 'forward' | 'backward'
const scrollPositions = new Map()
let lastHistoryPos = typeof window !== 'undefined' ? window.history.state?.position ?? 0 : 0

// The SPA is served by Frappe under /gotrain, so vue-router's base is /gotrain.
const routes = [
  { path: '/login', component: () => import('./views/Login.vue'), meta: { public: true } },

  // Athlete tabs
  { path: '/', component: () => import('./views/Train.vue'), meta: { tab: 'train' } },
  { path: '/classes', component: () => import('./views/Classes.vue'), meta: { tab: 'classes' } },
  { path: '/track', component: () => import('./views/Track.vue'), meta: { tab: 'track' } },
  { path: '/messages', component: () => import('./views/Messages.vue'), meta: { tab: 'messages' } },
  { path: '/profile', component: () => import('./views/Profile.vue'), meta: { tab: 'profile' } },

  // Deeper athlete screens
  { path: '/history', component: () => import('./views/History.vue') },
  { path: '/programs', component: () => import('./views/Programs.vue') },
  { path: '/programs/:id', component: () => import('./views/ProgramDetail.vue') },
  { path: '/workouts/:id', component: () => import('./views/WorkoutDetail.vue') },
  { path: '/threads/:id', component: () => import('./views/Thread.vue') },
  { path: '/notifications', component: () => import('./views/Notifications.vue') },
  { path: '/exercises', component: () => import('./views/Exercises.vue') },
  { path: '/marketplace', component: () => import('./views/Marketplace.vue') },
  { path: '/gym', component: () => import('./views/Gym.vue') },
  { path: '/promos', component: () => import('./views/Promos.vue') },

  // Coach
  { path: '/coach', component: () => import('./views/CoachClients.vue'), meta: { tab: 'clients', coach: true } },
  { path: '/coach/programs', component: () => import('./views/CoachPrograms.vue'), meta: { tab: 'programs', coach: true } },
]

export const router = createRouter({
  history: createWebHistory('/gotrain'),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (navDirection.value === 'backward' || to.meta.tab) {
      const saved = scrollPositions.get(to.fullPath)
      if (saved != null) return { top: saved }
    }
    return { top: 0 }
  },
})

router.beforeEach((to, from) => {
  if (typeof window !== 'undefined' && from.fullPath) {
    scrollPositions.set(from.fullPath, window.scrollY || 0)
  }

  if (to.meta.public) return true
  if (!session.user) {
    return { path: '/login', query: to.fullPath !== '/' ? { 'redirect-to': to.fullPath } : {} }
  }
  if (to.meta.coach && !isCoach()) return { path: '/' }
  return true
})

router.afterEach((to, from) => {
  if (typeof window === 'undefined') return
  const currentPos = window.history.state?.position ?? lastHistoryPos
  if (to.meta.tab && from.meta.tab) {
    navDirection.value = 'tab'
  } else if (currentPos < lastHistoryPos) {
    navDirection.value = 'backward'
  } else {
    navDirection.value = 'forward'
  }
  lastHistoryPos = currentPos
  document.documentElement.dataset.direction = navDirection.value
})
