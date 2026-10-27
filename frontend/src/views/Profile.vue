<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import BottomSheet from '../components/BottomSheet.vue'
import { api } from '../lib/api.js'
import {
  session,
  setUser,
  setRoleMode,
  clearSession,
  applyTheme,
  applyLocale,
} from '../lib/session.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'
import {
  isStandalone,
  canInstall,
  promptInstall,
  swUpdateAvailable,
  applySwUpdate,
} from '../lib/pwa.js'
import {
  notificationSupported,
  notificationPermission,
  requestNotificationPermission,
  sendLocalNotification,
  wakeLockSupported,
  wakeLockActive,
  toggleWakeLock,
  storagePersisted,
  storageUsageMb,
} from '../lib/permissions.js'

const router = useRouter()
const u = computed(() => session.user || {})
const testNotifSent = ref(false)

async function enableOrTestNotifications() {
  if (notificationPermission.value !== 'granted') {
    const res = await requestNotificationPermission()
    if (!res?.ok && res !== 'granted') return
    testNotifSent.value = true
    setTimeout(() => (testNotifSent.value = false), 2600)
    return
  }
  const ok = await sendLocalNotification({
    title: 'Go Train · Notifications Active ⚡',
    body: 'Rest timers, coach messages, and workout reminders will alert you just like a native app.',
    url: '/gotrain/notifications',
  })
  if (ok) {
    testNotifSent.value = true
    setTimeout(() => (testNotifSent.value = false), 2600)
  }
}

// Editable physical profile sheet
const editingProfile = ref(false)
const goal = ref(session.user?.goal || '')
const heightCm = ref(session.user?.height_cm || '')
const weightKg = ref(session.user?.weight_kg || '')
const savingProfile = ref(false)

function openEditProfile() {
  haptics.tap()
  goal.value = u.value.goal || ''
  heightCm.value = u.value.height_cm || ''
  weightKg.value = u.value.weight_kg || ''
  editingProfile.value = true
}

async function toggleLocale() {
  haptics.select()
  const locale = u.value.locale === 'ar' ? 'en' : 'ar'
  applyLocale(locale)
  setUser({ ...u.value, locale })
  try {
    const { user } = await api.patch('/auth/me', { locale })
    setUser({ ...u.value, ...user, locale })
  } catch {}
}

async function setTheme(theme) {
  haptics.select()
  applyTheme(theme)
  setUser({ ...u.value, theme })
  try {
    const { user } = await api.patch('/auth/me', { theme })
    setUser({ ...u.value, ...user, theme })
  } catch {}
}

async function savePhysicalProfile() {
  savingProfile.value = true
  haptics.medium()
  try {
    const { user } = await api.patch('/auth/me', {
      goal: goal.value,
      height_cm: heightCm.value,
      weight_kg: weightKg.value,
    })
    setUser({ ...u.value, ...user })
    haptics.success()
    editingProfile.value = false
  } finally {
    savingProfile.value = false
  }
}

function switchMode(mode) {
  haptics.medium()
  setRoleMode(mode)
  router.replace(mode === 'coach' ? '/coach' : '/')
}

async function logout() {
  haptics.warning()
  try {
    await fetch('/api/method/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {}
  clearSession()
  router.replace('/login')
}

const links = computed(() => [
  { to: '/programs', icon: 'programs', label: t('train.yourPrograms') },
  { to: '/classes', icon: 'calendar', label: t('train.classesTitle') },
  { to: '/exercises', icon: 'dumbbell', label: t('train.exercisesTitle') },
  { to: '/marketplace', icon: 'store', label: t('train.marketplaceTitle') },
  { to: '/gym', icon: 'team', label: 'Gym & Coaching Team' },
  { to: '/promos', icon: 'tag', label: 'Member Perks & Promos' },
])
</script>

<template>
  <Scaffold :title="t('tab.profile')" tab>
    <!-- Athlete / Coach Hero Card -->
    <div class="card p-5 mt-3 flex flex-col items-center text-center">
      <Avatar :name="u?.full_name" :url="u?.avatar_url" :size="86" />
      <p class="mt-3 text-lg font-bold text-ink">{{ u?.full_name }}</p>
      <p class="text-sm text-ink-mute">{{ u?.email }}</p>

      <div class="flex flex-wrap items-center justify-center gap-2 mt-2.5">
        <span class="pill text-brand-700 border-brand-200 bg-brand-50 capitalize">
          {{ u?.role === 'coach' ? 'Coach' : 'Athlete' }}
        </span>
        <span
          v-if="u?.weight_kg"
          class="pill text-ink-soft border-line bg-surface-sunk tabular-nums"
        >
          {{ u.weight_kg }} kg
        </span>
        <span
          v-if="u?.height_cm"
          class="pill text-ink-soft border-line bg-surface-sunk tabular-nums"
        >
          {{ u.height_cm }} cm
        </span>
      </div>

      <p v-if="u?.goal" class="text-xs text-ink-soft mt-2.5 max-w-xs italic">
        “{{ u.goal }}”
      </p>

      <button
        type="button"
        class="btn-soft !min-h-[40px] !px-4 text-xs mt-3.5"
        @click="openEditProfile"
      >
        Edit Stats &amp; Training Goal
      </button>
    </div>

    <!-- Coach / Athlete Workspace Mode Switcher -->
    <div
      v-if="u?.is_coach"
      class="card p-4 mt-4 flex items-center justify-between gap-3"
    >
      <div class="min-w-0">
        <p class="font-bold text-sm text-ink">{{ t('profile.roleMode') }}</p>
        <p class="text-xs text-ink-mute">
          Switch between Athlete workouts and Coach workspace
        </p>
      </div>
      <div class="flex gap-1 bg-surface-sunk p-1 rounded-full shrink-0">
        <button
          type="button"
          class="px-3.5 min-h-[38px] rounded-full text-xs font-semibold transition"
          :class="u?.role !== 'coach' ? 'bg-brand-650 text-white shadow-sm' : 'text-ink-soft'"
          @click="switchMode('client')"
        >
          {{ t('profile.clientView') }}
        </button>
        <button
          type="button"
          class="px-3.5 min-h-[38px] rounded-full text-xs font-semibold transition"
          :class="u?.role === 'coach' ? 'bg-brand-650 text-white shadow-sm' : 'text-ink-soft'"
          @click="switchMode('coach')"
        >
          {{ t('profile.coachView') }}
        </button>
      </div>
    </div>

    <p class="section-label mt-6 mb-2 px-1">{{ t('profile.exploreGym') }}</p>
    <div class="card divide-y divide-line overflow-hidden">
      <RouterLink
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        class="flex items-center gap-3 p-4 min-h-[56px] active:bg-surface-sunk transition"
        @click="haptics.tap()"
      >
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-ink-soft shrink-0">
          <Icon :name="l.icon" :size="18" />
        </div>
        <span class="flex-1 font-semibold text-ink">{{ l.label }}</span>
        <Icon name="chevron" :size="18" class="text-ink-mute" />
      </RouterLink>
    </div>

    <p class="section-label mt-6 mb-2 px-1">{{ t('profile.preferences') }}</p>
    <div class="card divide-y divide-line overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center gap-3 p-4 min-h-[56px] active:bg-surface-sunk transition"
        @click="toggleLocale"
      >
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-ink-soft shrink-0">
          <Icon name="globe" :size="18" />
        </div>
        <span class="flex-1 text-left font-semibold text-ink">
          {{ t('profile.language') }}
        </span>
        <span class="pill text-ink border-line bg-surface-sunk">
          {{ u?.locale === 'ar' ? 'العربية' : 'English' }}
        </span>
      </button>

      <div class="flex items-center gap-3 p-4 min-h-[56px]">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-ink-soft shrink-0">
          <Icon name="sun" :size="18" />
        </div>
        <span class="flex-1 font-semibold text-ink">{{ t('profile.theme') }}</span>
        <div class="flex gap-1 bg-surface-sunk p-1 rounded-full">
          <button
            v-for="th in ['system', 'light', 'dark']"
            :key="th"
            type="button"
            class="px-3 min-h-[36px] rounded-full text-xs font-semibold capitalize transition"
            :class="
              (u?.theme || 'system') === th
                ? 'bg-brand-650 text-white shadow-sm'
                : 'text-ink-soft'
            "
            @click="setTheme(th)"
          >
            {{ th }}
          </button>
        </div>
      </div>
    </div>

    <p class="section-label mt-6 mb-2 px-1">Device &amp; Native Capabilities</p>
    <div class="card divide-y divide-line overflow-hidden">
      <!-- Push & Timer Notifications -->
      <div v-if="notificationSupported" class="flex items-center gap-3 p-4 min-h-[56px]">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-brand-600 shrink-0">
          <Icon name="bell" :size="18" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-ink text-sm">Push &amp; Rest Timer Alerts</p>
          <p class="text-xs text-ink-mute truncate">
            {{
              notificationPermission === 'granted'
                ? testNotifSent
                  ? 'Test notification delivered!'
                  : 'Enabled for workout & rest alerts'
                : notificationPermission === 'denied'
                  ? 'Blocked in browser site settings'
                  : 'Get alerted when rest timers finish'
            }}
          </p>
        </div>
        <button
          type="button"
          class="btn-soft !min-h-[38px] !px-3.5 text-xs shrink-0"
          :disabled="notificationPermission === 'denied'"
          @click="enableOrTestNotifications"
        >
          {{
            notificationPermission === 'granted'
              ? testNotifSent
                ? 'Sent ✓'
                : 'Test Alert'
              : notificationPermission === 'denied'
                ? 'Blocked'
                : 'Enable'
          }}
        </button>
      </div>

      <!-- Screen Wake Lock -->
      <div v-if="wakeLockSupported" class="flex items-center gap-3 p-4 min-h-[56px]">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-brand-600 shrink-0">
          <Icon name="flame" :size="18" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-ink text-sm">Keep Screen Awake</p>
          <p class="text-xs text-ink-mute truncate">
            Auto-locks screen on during active workouts &amp; timers
          </p>
        </div>
        <button
          type="button"
          class="btn-soft !min-h-[38px] !px-3.5 text-xs shrink-0"
          :class="wakeLockActive ? '!bg-brand-650 !text-white' : ''"
          @click="toggleWakeLock()"
        >
          {{ wakeLockActive ? 'Awake On' : 'Auto' }}
        </button>
      </div>

      <!-- Offline Storage & App Installation Status -->
      <div class="flex items-center gap-3 p-4 min-h-[56px]">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-brand-600 shrink-0">
          <Icon name="spark" :size="18" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-ink text-sm">Native App Runtime</p>
          <p class="text-xs text-ink-mute truncate">
            {{ isStandalone ? 'Installed Standalone' : 'Browser Mode' }}
            <template v-if="storageUsageMb !== null"> · {{ storageUsageMb }} MB cached</template>
            <template v-if="storagePersisted"> · Persistent ✓</template>
          </p>
        </div>
        <button
          v-if="swUpdateAvailable"
          type="button"
          class="btn-primary !min-h-[38px] !px-3.5 text-xs shrink-0"
          @click="applySwUpdate()"
        >
          Update App
        </button>
        <button
          v-else-if="canInstall && !isStandalone"
          type="button"
          class="btn-primary !min-h-[38px] !px-3.5 text-xs shrink-0"
          @click="promptInstall()"
        >
          Install
        </button>
        <span
          v-else
          class="pill text-ok border-ok/30 bg-ok/10 text-xs shrink-0"
        >
          Ready ✓
        </span>
      </div>
    </div>

    <button
      type="button"
      class="btn-outline w-full mt-6 !text-bad !border-bad/40"
      @click="logout"
    >
      <Icon name="logout" :size="18" />
      {{ t('profile.signOut') }}
    </button>

    <!-- Physical Profile Editor Sheet -->
    <BottomSheet
      :open="editingProfile"
      title="Athlete Stats & Goal"
      @close="editingProfile = false"
    >
      <form class="space-y-3.5 pb-2" @submit.prevent="savePhysicalProfile">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-ink-soft block mb-1">
              Weight (kg)
            </label>
            <input
              v-model="weightKg"
              type="number"
              step="any"
              inputmode="decimal"
              class="field tabular-nums"
              placeholder="78.5"
            />
          </div>
          <div>
            <label class="text-xs font-semibold text-ink-soft block mb-1">
              Height (cm)
            </label>
            <input
              v-model="heightCm"
              type="number"
              step="any"
              inputmode="decimal"
              class="field tabular-nums"
              placeholder="178"
            />
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1">
            Current Training Goal
          </label>
          <input
            v-model="goal"
            class="field"
            placeholder="e.g. 140 kg Back Squat & Sub-4:00 Fran"
          />
        </div>

        <button type="submit" class="btn-primary w-full mt-2" :disabled="savingProfile">
          <Icon name="check" :size="18" />
          {{ savingProfile ? 'Saving…' : t('nav.save') }}
        </button>
      </form>
    </BottomSheet>
  </Scaffold>
</template>
