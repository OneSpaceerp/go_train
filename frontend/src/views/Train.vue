<script setup>
import { ref, onMounted, computed } from 'vue'
import dayjs from 'dayjs'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import MonthCalendar from '../components/MonthCalendar.vue'
import { api } from '../lib/api.js'
import { session } from '../lib/session.js'
import { niceDate } from '../lib/format.js'

const programs = ref([])
const activeProgram = ref(null)
const workouts = ref([])
const calendar = ref([])
const classInfo = ref(null)
const checkingIn = ref(false)
const loading = ref(true)
const expanded = ref(null)
const selectedDay = ref(dayjs().format('YYYY-MM-DD'))

onMounted(async () => {
  try {
    ;[programs.value, calendar.value, classInfo.value] = await Promise.all([
      api.get('/programs'),
      api.get('/calendar'),
      api.get('/classes').catch(() => null),
    ])
    activeProgram.value = programs.value.find((p) => p.is_active) || programs.value[0]
    if (activeProgram.value) {
      workouts.value = await api.get(`/programs/${activeProgram.value.id}/workouts`)
      expanded.value = workouts.value[0]?.id
    }
  } finally {
    loading.value = false
  }
})

async function quickCheckIn() {
  if (checkingIn.value || classInfo.value?.checked_in_today) return
  checkingIn.value = true
  try {
    await api.post('/checkin', {})
    if (classInfo.value) classInfo.value.checked_in_today = true
  } finally {
    checkingIn.value = false
  }
}

// Workouts scheduled on the picked calendar day (across all programs).
const dayWorkoutIds = computed(() =>
  new Set(calendar.value.filter((e) => dayjs(e.scheduled_on).format('YYYY-MM-DD') === selectedDay.value).map((e) => e.id)))
const hasDayFilter = computed(() => dayWorkoutIds.value.size > 0)
const shownWorkouts = computed(() =>
  hasDayFilter.value ? workouts.value.filter((w) => dayWorkoutIds.value.has(w.id)) : workouts.value)

function onPick(date) {
  selectedDay.value = date
  const first = workouts.value.find((w) => dayWorkoutIds.value.has(w.id))
  if (first) expanded.value = first.id
}
</script>

<template>
  <Scaffold tab>
    <!-- Greeting -->
    <div class="flex items-center gap-3 pt-5 pb-4">
      <Avatar :name="session.user?.full_name" :url="session.user?.avatar_url" />
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-soft">Welcome,</p>
        <p class="font-semibold truncate">{{ session.user?.full_name }}</p>
      </div>
      <RouterLink to="/classes" class="icon-btn bg-surface-sunk" aria-label="Classes & Check-in"><Icon name="calendar" :size="20" /></RouterLink>
      <RouterLink to="/notifications" class="icon-btn bg-surface-sunk" aria-label="Notifications"><Icon name="bell" :size="20" /></RouterLink>
      <RouterLink to="/history" class="icon-btn bg-surface-sunk" aria-label="History"><Icon name="history" :size="20" /></RouterLink>
    </div>

    <!-- Quick Check-in & Classes strip -->
    <div v-if="classInfo" class="card p-3.5 mb-4 flex items-center justify-between gap-3">
      <RouterLink to="/classes" class="flex items-center gap-3 flex-1 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0">
          <Icon name="calendar" :size="20" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-sm truncate">Classes &amp; Check-in</p>
          <p class="text-xs text-ink-soft truncate">
            {{ classInfo.sessions?.length ? `${classInfo.sessions.length} upcoming session${classInfo.sessions.length === 1 ? '' : 's'}` : 'Floor check-in & schedule' }}
          </p>
        </div>
      </RouterLink>
      <button v-if="classInfo.can_self_checkin" class="btn-soft !h-9 !px-3.5 text-xs shrink-0"
        :class="classInfo.checked_in_today ? '!bg-ok/15 !text-ok' : ''"
        :disabled="checkingIn || classInfo.checked_in_today"
        @click="quickCheckIn">
        <Icon name="check" :size="15" />
        {{ classInfo.checked_in_today ? 'Checked in' : checkingIn ? 'Checking in…' : 'Check in' }}
      </button>
    </div>

    <!-- Month calendar -->
    <div class="mb-4">
      <MonthCalendar :events="calendar" @pick="onPick" />
      <div class="flex items-center gap-4 justify-center mt-2 text-[0.72rem] text-ink-soft">
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-ok"></span>Done</span>
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-bad"></span>Missed</span>
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>Scheduled</span>
      </div>
    </div>

    <!-- Active program -->
    <RouterLink v-if="activeProgram" to="/programs"
      class="card p-4 mb-4 flex items-center gap-3 active:scale-[0.99] transition">
      <div class="w-11 h-11 rounded-xl bg-brand-600 text-white grid place-items-center"><Icon name="dumbbell" :size="22" /></div>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-soft">Program</p>
        <p class="font-semibold truncate">{{ activeProgram.name }}</p>
      </div>
      <Icon name="chevron" :size="20" class="text-ink-mute" />
    </RouterLink>

    <!-- Day heading when a day with workouts is picked -->
    <div v-if="hasDayFilter" class="flex items-center justify-between px-1 mb-2">
      <p class="section-label">{{ niceDate(selectedDay) }}</p>
      <span class="text-xs text-ink-soft">{{ shownWorkouts.length }} workout{{ shownWorkouts.length === 1 ? '' : 's' }}</span>
    </div>

    <!-- Workouts -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 2" :key="i" class="card p-4 h-24 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!workouts.length" icon="dumbbell" title="No workouts added yet!"
      subtitle="When your coach adds training days, they show up here." />
    <EmptyState v-else-if="!shownWorkouts.length" icon="calendar" title="Nothing on this day"
      subtitle="Pick another day, or scroll your program below." >
      <button class="btn-soft mt-4" @click="selectedDay = ''">Show all workouts</button>
    </EmptyState>

    <div v-else class="space-y-3">
      <article v-for="w in shownWorkouts" :key="w.id" class="card overflow-hidden">
        <button class="w-full flex items-center gap-3 p-4 text-left" @click="expanded = expanded === w.id ? null : w.id">
          <span v-if="w.letter" class="w-7 h-7 rounded-lg bg-ink text-surface grid place-items-center text-xs font-bold">{{ w.letter }}</span>
          <span class="flex-1 font-bold">{{ w.title }}</span>
          <StatusPill v-if="w.my_log" :status="w.my_log.status" />
          <Icon name="chevron" :size="18" class="text-ink-mute transition" :class="expanded === w.id ? 'rotate-90' : ''" />
        </button>
        <div v-if="expanded === w.id" class="px-4 pb-2 -mt-1 border-t border-line">
          <p class="whitespace-pre-line text-ink-soft text-[0.9rem] pt-3 line-clamp-6">{{ w.body }}</p>
          <div class="flex gap-2 py-3">
            <RouterLink :to="`/workouts/${w.id}`" class="btn-primary flex-1">{{ w.my_log ? 'View / edit log' : 'Log' }}</RouterLink>
            <RouterLink :to="`/workouts/${w.id}`" class="icon-btn bg-surface-sunk w-12 h-12" aria-label="Details"><Icon name="share" :size="18" /></RouterLink>
          </div>
        </div>
      </article>
    </div>
  </Scaffold>
</template>
