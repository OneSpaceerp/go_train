<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import { api } from '../lib/api.js'
import { session, setUser, setRoleMode, clearSession, applyTheme, applyLocale } from '../lib/session.js'

const router = useRouter()
const u = computed(() => session.user || {})

// Editable physical profile sheet
const editingProfile = ref(false)
const goal = ref(session.user?.goal || '')
const heightCm = ref(session.user?.height_cm || '')
const weightKg = ref(session.user?.weight_kg || '')
const savingProfile = ref(false)

async function toggleLocale() {
  const locale = u.value.locale === 'ar' ? 'en' : 'ar'
  applyLocale(locale)
  const { user } = await api.patch('/auth/me', { locale })
  setUser({ ...u.value, ...user, locale })
}

async function setTheme(theme) {
  applyTheme(theme)
  const { user } = await api.patch('/auth/me', { theme })
  setUser({ ...u.value, ...user, theme })
}

async function savePhysicalProfile() {
  savingProfile.value = true
  try {
    const { user } = await api.patch('/auth/me', {
      goal: goal.value,
      height_cm: heightCm.value,
      weight_kg: weightKg.value,
    })
    setUser({ ...u.value, ...user })
    editingProfile.value = false
  } finally {
    savingProfile.value = false
  }
}

function switchMode(mode) {
  setRoleMode(mode)
  router.replace(mode === 'coach' ? '/coach' : '/')
}

async function logout() {
  try {
    await fetch('/api/method/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {}
  clearSession()
  router.replace('/login')
}

const links = [
  { to: '/programs', icon: 'programs', label: 'My programs' },
  { to: '/classes', icon: 'calendar', label: 'Classes & check-in' },
  { to: '/exercises', icon: 'dumbbell', label: 'Exercise library' },
  { to: '/marketplace', icon: 'store', label: 'Marketplace' },
  { to: '/gym', icon: 'team', label: 'Gym / Team' },
  { to: '/promos', icon: 'tag', label: 'Promos' },
]
</script>

<template>
  <Scaffold title="Profile" tab>
    <div class="card p-5 mt-4 flex flex-col items-center text-center">
      <Avatar :name="u?.full_name" :url="u?.avatar_url" :size="86" />
      <p class="mt-3 text-lg font-semibold">{{ u?.full_name }}</p>
      <p class="text-sm text-ink-soft">{{ u?.email }}</p>
      <div class="flex items-center gap-2 mt-2">
        <span class="pill text-brand-700 border-brand-200 bg-brand-50 capitalize">{{ u?.role || 'athlete' }}</span>
        <span v-if="u?.weight_kg" class="pill text-ink-soft border-line bg-surface-sunk">{{ u.weight_kg }} kg</span>
        <span v-if="u?.height_cm" class="pill text-ink-soft border-line bg-surface-sunk">{{ u.height_cm }} cm</span>
      </div>
      <p v-if="u?.goal" class="text-xs text-ink-soft mt-2 max-w-xs italic">“{{ u.goal }}”</p>
      <button class="btn-soft !h-8 !px-3 text-xs mt-3" @click="editingProfile = !editingProfile">
        {{ editingProfile ? 'Cancel' : 'Edit goals & body stats' }}
      </button>
    </div>

    <!-- Physical profile editor -->
    <form v-if="editingProfile" class="card p-4 mt-3 space-y-2.5" @submit.prevent="savePhysicalProfile">
      <p class="section-label">Athlete Stats &amp; Goal</p>
      <div class="grid grid-cols-2 gap-2">
        <input v-model="weightKg" type="number" step="any" class="field !h-11" placeholder="Weight (kg)" />
        <input v-model="heightCm" type="number" step="any" class="field !h-11" placeholder="Height (cm)" />
      </div>
      <input v-model="goal" class="field !h-11" placeholder="Training goal (e.g. 140 kg Back Squat)" />
      <button class="btn-primary w-full !h-11" :disabled="savingProfile">
        {{ savingProfile ? 'Saving…' : 'Save profile' }}
      </button>
    </form>

    <!-- Coach / Athlete mode switcher (for coaches & staff) -->
    <div v-if="u?.is_coach" class="card p-4 mt-4 flex items-center justify-between gap-3">
      <div>
        <p class="font-semibold text-sm">Workspace Mode</p>
        <p class="text-xs text-ink-soft">Switch between Athlete training and Coach management</p>
      </div>
      <div class="flex gap-1 bg-surface-sunk p-1 rounded-full">
        <button class="px-3 h-8 rounded-full text-xs font-medium transition"
          :class="u?.role !== 'coach' ? 'bg-brand-600 text-white' : 'text-ink-soft'"
          @click="switchMode('client')">Athlete</button>
        <button class="px-3 h-8 rounded-full text-xs font-medium transition"
          :class="u?.role === 'coach' ? 'bg-brand-600 text-white' : 'text-ink-soft'"
          @click="switchMode('coach')">Coach</button>
      </div>
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
