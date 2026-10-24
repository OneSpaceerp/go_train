<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import { api } from '../lib/api.js'
import { session, setUser, clearSession, applyTheme, isCoach } from '../lib/session.js'

const router = useRouter()
const u = session.user

async function toggleLocale() {
  const locale = u.locale === 'ar' ? 'en' : 'ar'
  const { user } = await api.patch('/auth/me', { locale }); setUser(user)
}
async function setTheme(theme) {
  const { user } = await api.patch('/auth/me', { theme }); setUser(user); applyTheme(theme)
}
function logout() { clearSession(); router.replace('/login') }

const links = [
  { to: '/programs', icon: 'programs', label: 'My programs', coachOnly: false },
  { to: '/marketplace', icon: 'store', label: 'Marketplace' },
  { to: '/gym', icon: 'team', label: 'Gym / Team' },
  { to: '/promos', icon: 'tag', label: 'Promos' },
  { to: '/exercises', icon: 'dumbbell', label: 'Exercise library' },
]
</script>

<template>
  <Scaffold title="Profile" tab>
    <div class="card p-5 mt-4 flex flex-col items-center text-center">
      <Avatar :name="u?.full_name" :url="u?.avatar_url" :size="86" />
      <p class="mt-3 text-lg font-semibold">{{ u?.full_name }}</p>
      <p class="text-sm text-ink-soft">{{ u?.email }}</p>
      <span class="pill mt-2 text-brand-700 border-brand-200 bg-brand-50 capitalize">{{ u?.role }}</span>
    </div>

    <p class="section-label mt-6 mb-2 px-1">Explore</p>
    <div class="card divide-y divide-line">
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="flex items-center gap-3 p-4 active:bg-surface-sunk">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-ink-soft"><Icon :name="l.icon" :size="18" /></div>
        <span class="flex-1 font-medium">{{ l.label }}</span>
        <Icon name="chevron" :size="18" class="text-ink-mute" />
      </RouterLink>
    </div>

    <p class="section-label mt-6 mb-2 px-1">Settings</p>
    <div class="card divide-y divide-line">
      <button class="w-full flex items-center gap-3 p-4" @click="toggleLocale">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-ink-soft"><Icon name="globe" :size="18" /></div>
        <span class="flex-1 text-left font-medium">Language</span>
        <span class="pill text-ink-soft border-line bg-surface-sunk">{{ u?.locale === 'ar' ? 'العربية' : 'English' }}</span>
      </button>
      <div class="flex items-center gap-3 p-4">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-ink-soft"><Icon name="sun" :size="18" /></div>
        <span class="flex-1 font-medium">Theme</span>
        <div class="flex gap-1">
          <button v-for="t in ['system','light','dark']" :key="t" class="px-3 h-8 rounded-full text-xs capitalize transition"
            :class="(u?.theme||'system') === t ? 'bg-brand-600 text-white' : 'bg-surface-sunk text-ink-soft'"
            @click="setTheme(t)">{{ t }}</button>
        </div>
      </div>
    </div>

    <button class="btn-outline w-full mt-6 !text-bad !border-bad/40" @click="logout">
      <Icon name="logout" :size="18" /> Logout
    </button>
  </Scaffold>
</template>
