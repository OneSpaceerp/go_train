import { createRouter, createWebHistory } from 'vue-router'
import { session, isCoach } from './lib/session.js'

const routes = [
  { path: '/login', component: () => import('./views/Login.vue'), meta: { public: true } },

  // Athlete tabs
  { path: '/', component: () => import('./views/Train.vue'), meta: { tab: 'train' } },
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

export const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!session.token) return { path: '/login' }
  if (to.meta.coach && !isCoach()) return { path: '/' }
  return true
})
