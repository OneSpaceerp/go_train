<script setup>
import { ref, onMounted, computed } from 'vue'
import dayjs from 'dayjs'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import MonthCalendar from '../components/MonthCalendar.vue'
import BottomSheet from '../components/BottomSheet.vue'
import { onScreenReturn } from '../lib/useScreen.js'
import { api } from '../lib/api.js'
import { session } from '../lib/session.js'
import { niceDate } from '../lib/format.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'
import {
  canPromptInstall,
  isIos,
  triggerInstallPrompt,
  dismissInstallBanner,
  unreadNotifications,
} from '../lib/pwa.js'

const programs = ref(api.cached('/programs') || [])
const activeProgram = ref(null)
const workouts = ref([])
const calendar = ref(api.cached('/calendar') || [])
const classInfo = ref(api.cached('/classes') || null)
const checkingIn = ref(false)
const loading = ref(true)
const expanded = ref(null)
const showFullMonth = ref(false)
const showIosInstallSheet = ref(false)
const todayIso = dayjs().format('YYYY-MM-DD')
const selectedDay = ref(todayIso)

const greeting = computed(() => {
  const hr = new Date().getHours()
  if (hr < 12) return t('train.greeting.morning')
  if (hr < 17) return t('train.greeting.afternoon')
  return t('train.greeting.evening')
})

async function selectProgram(prog) {
  if (!prog) return
  haptics.select()
  activeProgram.value = prog
  const list = await api.get(`/programs/${prog.id}/workouts`).catch(() => [])
  workouts.value = list.map((w) => ({ ...w, program_name: prog.name, program_id: prog.id }))
  if (workouts.value.length) {
    expanded.value = workouts.value[0].id
  }
}

// Workouts are loaded per month window (the server pads each month by a week)
// instead of one request per program.
const loadedMonths = new Set()

function mergeWorkouts(list) {
  const byId = new Map(workouts.value.map((w) => [w.id, w]))
  for (const w of list || []) byId.set(w.id, w)
  // Newest first, matching the per-program workout lists
  workouts.value = Array.from(byId.values()).sort((a, b) =>
    String(b.scheduled_on || '').localeCompare(String(a.scheduled_on || '')),
  )
}

async function ensureMonth(month) {
  if (!month || loadedMonths.has(month)) return
  loadedMonths.add(month)
  try {
    const [feed, cal] = await Promise.all([
      api.get(`/feed?month=${month}`),
      api.get(`/calendar?month=${month}`),
    ])
    mergeWorkouts(feed)
    const byId = new Map(calendar.value.map((e) => [e.id, e]))
    for (const e of cal || []) byId.set(e.id, e)
    calendar.value = Array.from(byId.values())
  } catch {
    loadedMonths.delete(month)
  }
}

async function load() {
  try {
    loadedMonths.clear()
    // Isolate each endpoint with .catch() so a failure in one never blocks workouts
    const [progs, cal, feed, cls] = await Promise.all([
      api.get('/programs').catch(() => []),
      api.get('/calendar').catch(() => []),
      api.get('/feed').catch(() => []),
      api.get('/classes').catch(() => null),
    ])
    programs.value = progs || []
    calendar.value = cal || []
    classInfo.value = cls
    workouts.value = []
    mergeWorkouts(feed)
    // The default window covers last, this and next month
    for (const n of [-1, 0, 1]) loadedMonths.add(dayjs().add(n, 'month').format('YYYY-MM'))

    const firstWithWorkouts = programs.value.find((p) => workouts.value.some((w) => w.program_id === p.id))
    activeProgram.value =
      firstWithWorkouts || programs.value.find((p) => p.status === 'Active') || programs.value[0] || null

    if (!expanded.value && workouts.value.length) {
      const onSelected = workouts.value.find(
        (w) => w.scheduled_on && dayjs(w.scheduled_on).format('YYYY-MM-DD') === selectedDay.value,
      )
      expanded.value = (onSelected || workouts.value[0]).id
    }

    api.get('/notifications').catch(() => {})
  } finally {
    loading.value = false
  }
}

onMounted(load)
onScreenReturn(load)

async function quickCheckIn() {
  if (checkingIn.value || classInfo.value?.checked_in_today) return
  haptics.medium()
  checkingIn.value = true
  try {
    await api.post('/checkin', {})
    if (classInfo.value) classInfo.value.checked_in_today = true
    haptics.success()
  } finally {
    checkingIn.value = false
  }
}

async function onInstallClick() {
  haptics.tap()
  if (isIos.value) {
    showIosInstallSheet.value = true
  } else {
    await triggerInstallPrompt()
  }
}

// Merge backend calendar events with loaded workouts so status dots always appear
const mergedCalendarEvents = computed(() => {
  const byId = new Map()
  for (const e of calendar.value) {
    if (e.scheduled_on) byId.set(e.id, e)
  }
  for (const w of workouts.value) {
    if (w.scheduled_on && !byId.has(w.id)) {
      byId.set(w.id, {
        id: w.id,
        title: w.title,
        scheduled_on: w.scheduled_on,
        status: w.my_log?.status || 'upcoming',
      })
    }
  }
  return Array.from(byId.values())
})

// 7-day week strip centered around selectedDay's week
const weekDays = computed(() => {
  const start = dayjs(selectedDay.value || todayIso).startOf('week')
  return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'))
})

const byDateStatus = computed(() => {
  const m = {}
  for (const e of mergedCalendarEvents.value) {
    const key = dayjs(e.scheduled_on).format('YYYY-MM-DD')
    const rank = { missed: 3, done: 2 }[e.status] || 1
    if (!m[key] || rank > m[key].rank) m[key] = { status: e.status || 'upcoming', rank }
  }
  return m
})

const dotClass = (d) => {
  const s = byDateStatus.value[d.format('YYYY-MM-DD')]
  if (!s) return ''
  return { missed: 'bg-bad', done: 'bg-ok', upcoming: 'bg-accent' }[s.status]
}

// Workouts scheduled on the picked calendar day (checking both workouts & calendar).
const dayWorkoutIds = computed(() => {
  if (!selectedDay.value) return new Set()
  const ids = new Set()
  for (const e of mergedCalendarEvents.value) {
    if (dayjs(e.scheduled_on).format('YYYY-MM-DD') === selectedDay.value) {
      ids.add(e.id)
    }
  }
  for (const w of workouts.value) {
    if (w.scheduled_on && dayjs(w.scheduled_on).format('YYYY-MM-DD') === selectedDay.value) {
      ids.add(w.id)
    }
  }
  return ids
})

const hasDayFilter = computed(() => Boolean(selectedDay.value) && dayWorkoutIds.value.size > 0)
const shownWorkouts = computed(() =>
  hasDayFilter.value
    ? workouts.value.filter((w) => dayWorkoutIds.value.has(w.id))
    : workouts.value,
)

// Highlighted Hero Workout (selected day's workout, or next unlogged workout, or first workout)
const heroWorkout = computed(() => {
  if (!workouts.value.length) return null
  const onSelected = workouts.value.find((w) => dayWorkoutIds.value.has(w.id))
  if (onSelected) return onSelected
  const unlogged = workouts.value.find((w) => !w.my_log)
  return unlogged || workouts.value[0]
})

function onPick(date) {
  haptics.select()
  selectedDay.value = date
  ensureMonth(dayjs(date).format('YYYY-MM'))
  const first = workouts.value.find(
    (w) => w.scheduled_on && dayjs(w.scheduled_on).format('YYYY-MM-DD') === date,
  )
  if (first) expanded.value = first.id
}
</script>

<template>
  <Scaffold tab :onRefresh="load">
    <!-- Top Greeting Bar -->
    <div class="flex items-center gap-3 pt-4 pb-3">
      <RouterLink to="/profile" class="shrink-0 active:scale-95 transition">
        <Avatar :name="session.user?.full_name" :url="session.user?.avatar_url" :size="44" />
      </RouterLink>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-ink-mute">{{ greeting }},</p>
        <p class="text-[1.0625rem] font-bold text-ink truncate">
          {{ session.user?.full_name }}
        </p>
      </div>

      <button
        v-if="classInfo?.can_self_checkin"
        type="button"
        class="btn-soft !min-h-[44px] !px-3.5 text-sm shrink-0"
        :class="classInfo.checked_in_today ? '!bg-ok/15 !text-ok' : ''"
        :disabled="checkingIn || classInfo.checked_in_today"
        @click="quickCheckIn"
      >
        <Icon name="check" :size="15" />
        {{ classInfo.checked_in_today ? t('train.checkedIn') : t('train.checkInFloor') }}
      </button>

      <RouterLink
        to="/notifications"
        class="icon-btn bg-surface relative shadow-sm border border-line/60"
        aria-label="Notifications"
      >
        <Icon name="bell" :size="20" />
        <span
          v-if="unreadNotifications > 0"
          class="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-surface"
        ></span>
      </RouterLink>

      <RouterLink
        to="/history"
        class="icon-btn bg-surface shadow-sm border border-line/60"
        aria-label="Workout History"
      >
        <Icon name="history" :size="20" />
      </RouterLink>
    </div>

    <!-- Native PWA Install Prompt Banner -->
    <div
      v-if="canPromptInstall"
      class="card p-3.5 mb-3.5 flex items-center gap-3 bg-gradient-to-r from-accent-soft/80 to-surface border-accent/60"
    >
      <div class="w-10 h-10 rounded-xl bg-accent text-accent-on grid place-items-center shrink-0">
        <Icon name="download" :size="19" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm text-ink truncate">{{ t('pwa.installTitle') }}</p>
        <p class="text-xs text-ink-soft line-clamp-1">{{ t('pwa.installSub') }}</p>
      </div>
      <button type="button" class="btn-primary !min-h-[44px] !px-3.5 text-sm" @click="onInstallClick">
        {{ t('pwa.installBtn') }}
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Dismiss install banner"
        @click="dismissInstallBanner"
      >
        <Icon name="x" :size="15" />
      </button>
    </div>

    <!-- Week Strip + Expandable Full Month Toggle -->
    <section class="mb-4">
      <div class="flex items-center justify-between px-1 mb-2">
        <span class="section-label">
          {{ dayjs(selectedDay || todayIso).format('MMMM YYYY') }}
        </span>
        <button
          type="button"
          class="text-xs font-semibold text-accent-ink min-h-[44px] px-2 flex items-center gap-1"
          @click="showFullMonth = !showFullMonth"
        >
          <Icon name="calendar" :size="15" />
          {{ showFullMonth ? t('train.hideCalendar') : t('train.monthCalendar') }}
        </button>
      </div>

      <MonthCalendar
        v-if="showFullMonth"
        :events="mergedCalendarEvents"
        :modelValue="selectedDay"
        @pick="onPick"
        @month="ensureMonth"
      />

      <!-- Compact 7-Day Week Strip (Thumb-friendly 44x56pt targets) -->
      <div v-else class="card p-2 grid grid-cols-7 gap-1 text-center">
        <button
          v-for="d in weekDays"
          :key="d.toString()"
          type="button"
          class="min-h-[58px] py-1.5 rounded-2xl flex flex-col items-center justify-between transition active:scale-95"
          :class="
            d.format('YYYY-MM-DD') === selectedDay
              ? 'bg-accent text-accent-on shadow-sm'
              : d.format('YYYY-MM-DD') === todayIso
                ? 'bg-accent-soft/70 text-ink ring-1 ring-accent'
                : 'text-ink hover:bg-surface-sunk'
          "
          @click="onPick(d.format('YYYY-MM-DD'))"
        >
          <span
            class="text-[0.6875rem] font-medium uppercase"
            :class="d.format('YYYY-MM-DD') === selectedDay ? 'text-accent-on/75' : 'text-ink-mute'"
          >
            {{ d.format('dd') }}
          </span>
          <span class="text-sm font-bold tabular-nums">{{ d.format('D') }}</span>
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="
              d.format('YYYY-MM-DD') === selectedDay
                ? dotClass(d)
                  ? 'bg-white'
                  : 'bg-transparent'
                : dotClass(d) || 'bg-transparent'
            "
          ></span>
        </button>
      </div>
    </section>

    <!-- Today's Hero Session Card -->
    <section v-if="heroWorkout" class="mb-4">
      <div class="card p-4 border-l-4 border-l-accent">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="section-label text-accent-ink flex items-center gap-1.5">
            <Icon name="flame" :size="15" />
            {{ t('train.todayFocus') }}
          </span>
          <StatusPill v-if="heroWorkout.my_log" :status="heroWorkout.my_log.status" />
          <span
            v-else-if="heroWorkout.scheduled_on"
            class="text-xs font-medium text-ink-mute tabular-nums"
          >
            {{ niceDate(heroWorkout.scheduled_on) }}
          </span>
        </div>

        <div class="flex items-center gap-2.5 mt-1">
          <span
            v-if="heroWorkout.letter"
            class="w-8 h-8 rounded-xl bg-ink text-surface grid place-items-center text-xs font-bold shrink-0"
          >
            {{ heroWorkout.letter }}
          </span>
          <h2 class="text-[1.125rem] font-bold text-ink leading-snug">
            {{ heroWorkout.title }}
          </h2>
        </div>

        <p
          v-if="heroWorkout.body"
          class="mt-2 text-sm text-ink-soft whitespace-pre-line line-clamp-3 selectable"
          dir="auto"
        >
          {{ heroWorkout.body }}
        </p>

        <div class="mt-3.5 flex items-center gap-2.5">
          <RouterLink :to="`/workouts/${heroWorkout.id}`" class="btn-primary flex-1">
            <Icon :name="heroWorkout.my_log ? 'check' : 'play'" :size="17" />
            {{ heroWorkout.my_log ? t('train.reviewLog') : t('train.startWorkout') }}
          </RouterLink>
          <RouterLink
            v-if="heroWorkout.program_id || activeProgram"
            :to="`/programs/${heroWorkout.program_id || activeProgram.id}`"
            class="btn-outline !px-4 text-sm truncate max-w-[10rem]"
          >
            {{ heroWorkout.program_name || activeProgram.name }}
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Active Program Selector Bar (with quick switcher pills when athlete has >1 program) -->
    <div v-if="programs.length > 1" class="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
      <button
        v-for="p in programs"
        :key="p.id"
        type="button"
        class="min-h-[44px] px-3.5 rounded-full text-xs font-semibold border transition shrink-0"
        :class="
          activeProgram?.id === p.id
            ? 'bg-ink text-surface border-ink shadow-sm'
            : 'bg-surface border-line text-ink-soft'
        "
        @click="selectProgram(p)"
      >
        {{ p.name }}
        <span v-if="p.workout_count" class="opacity-75 ml-1 tabular-nums">({{ p.workout_count }})</span>
      </button>
    </div>

    <RouterLink
      v-if="activeProgram"
      to="/programs"
      class="card p-3.5 mb-4 flex items-center gap-3 active:scale-[0.99] transition"
    >
      <div class="w-11 h-11 rounded-xl bg-accent text-accent-on grid place-items-center shrink-0">
        <Icon name="dumbbell" :size="21" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-mute">{{ t('train.yourPrograms') }}</p>
        <p class="font-semibold text-ink truncate">{{ activeProgram.name }}</p>
      </div>
      <span class="pill border-line bg-surface-sunk text-ink-soft tabular-nums">
        {{ workouts.length }} {{ workouts.length === 1 ? 'day' : 'days' }}
      </span>
      <Icon name="chevron" :size="19" class="text-ink-mute" />
    </RouterLink>

    <!-- Day Heading / Filter -->
    <div class="flex items-center justify-between px-1 mb-2">
      <p class="section-label">
        {{ hasDayFilter ? `${t('train.scheduledFor')} ${niceDate(selectedDay)}` : 'Program Sessions' }}
      </p>
      <button
        v-if="hasDayFilter"
        type="button"
        class="min-h-[44px] px-2 -me-2 text-sm font-semibold text-accent-ink"
        @click="selectedDay = ''"
      >
        Show all ({{ workouts.length }})
      </button>
    </div>

    <!-- Workout Cards List -->
    <div v-if="loading && !workouts.length" class="space-y-3">
      <div v-for="i in 2" :key="i" class="card p-4 h-24 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState
      v-else-if="!workouts.length"
      icon="dumbbell"
      title="No workouts added yet!"
      subtitle="When your coach adds training days, they show up here."
    />
    <div v-else class="space-y-2.5 mb-5">
      <article v-for="w in shownWorkouts" :key="w.id" class="card overflow-hidden">
        <button
          type="button"
          class="w-full flex items-center gap-3 p-4 text-left min-h-[60px]"
          @click="expanded = expanded === w.id ? null : w.id"
        >
          <span
            v-if="w.letter"
            class="w-7 h-7 rounded-lg bg-ink text-surface grid place-items-center text-xs font-bold shrink-0"
          >
            {{ w.letter }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-ink truncate">{{ w.title }}</p>
            <p class="text-xs text-ink-mute tabular-nums truncate">
              <template v-if="w.scheduled_on">{{ niceDate(w.scheduled_on) }}</template>
              <template v-if="w.scheduled_on && w.program_name"> · </template>
              <template v-if="w.program_name">{{ w.program_name }}</template>
            </p>
          </div>
          <StatusPill v-if="w.my_log" :status="w.my_log.status" />
          <Icon
            name="chevron"
            :size="18"
            class="text-ink-mute transition-transform duration-200"
            :class="expanded === w.id ? 'rotate-90' : ''"
          />
        </button>

        <div v-if="expanded === w.id" class="px-4 pb-3 border-t border-line/70">
          <p
            class="whitespace-pre-line text-ink-soft text-[0.9375rem] pt-3 line-clamp-6 selectable"
            dir="auto"
          >
            {{ w.body }}
          </p>
          <div class="flex gap-2 pt-3">
            <RouterLink :to="`/workouts/${w.id}`" class="btn-primary flex-1">
              {{ w.my_log ? t('train.reviewLog') : t('train.startWorkout') }}
            </RouterLink>
          </div>
        </div>
      </article>
    </div>

    <!-- Quick Explore 2x2 Grid -->
    <p class="section-label px-1 mb-2">{{ t('train.QuickExplore') }}</p>
    <div class="grid grid-cols-2 gap-2.5">
      <RouterLink
        to="/classes"
        class="card p-3.5 flex items-center gap-3 active:scale-[0.98] transition"
      >
        <div class="w-10 h-10 rounded-xl bg-accent-soft text-accent-ink grid place-items-center shrink-0">
          <Icon name="calendar" :size="20" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-sm text-ink truncate">{{ t('train.classesTitle') }}</p>
          <p class="text-xs text-ink-mute truncate">{{ t('train.classesSub') }}</p>
        </div>
      </RouterLink>

      <RouterLink
        to="/exercises"
        class="card p-3.5 flex items-center gap-3 active:scale-[0.98] transition"
      >
        <div class="w-10 h-10 rounded-xl bg-surface-sunk text-ink grid place-items-center shrink-0">
          <Icon name="dumbbell" :size="20" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-sm text-ink truncate">{{ t('train.exercisesTitle') }}</p>
          <p class="text-xs text-ink-mute truncate">{{ t('train.exercisesSub') }}</p>
        </div>
      </RouterLink>

      <RouterLink
        to="/marketplace"
        class="card p-3.5 flex items-center gap-3 active:scale-[0.98] transition"
      >
        <div class="w-10 h-10 rounded-xl bg-surface-sunk text-ink grid place-items-center shrink-0">
          <Icon name="store" :size="20" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-sm text-ink truncate">{{ t('train.marketplaceTitle') }}</p>
          <p class="text-xs text-ink-mute truncate">{{ t('train.marketplaceSub') }}</p>
        </div>
      </RouterLink>

      <RouterLink
        to="/history"
        class="card p-3.5 flex items-center gap-3 active:scale-[0.98] transition"
      >
        <div class="w-10 h-10 rounded-xl bg-surface-sunk text-ink grid place-items-center shrink-0">
          <Icon name="history" :size="20" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-sm text-ink truncate">{{ t('train.historyTitle') }}</p>
          <p class="text-xs text-ink-mute truncate">{{ t('train.historySub') }}</p>
        </div>
      </RouterLink>
    </div>

    <!-- iOS "Add to Home Screen" Guide Sheet -->
    <BottomSheet
      :open="showIosInstallSheet"
      :title="t('pwa.iosGuideTitle')"
      :closeLabel="t('nav.done')"
      @close="showIosInstallSheet = false"
    >
      <div class="space-y-3 text-sm text-ink-soft pb-2">
        <div class="p-3.5 rounded-2xl bg-surface-sunk flex items-center gap-3">
          <Icon name="share" :size="22" class="text-accent-ink shrink-0" />
          <span>{{ t('pwa.iosStep1') }}</span>
        </div>
        <div class="p-3.5 rounded-2xl bg-surface-sunk flex items-center gap-3">
          <Icon name="plus" :size="22" class="text-accent-ink shrink-0" />
          <span>{{ t('pwa.iosStep2') }}</span>
        </div>
        <div class="p-3.5 rounded-2xl bg-surface-sunk flex items-center gap-3">
          <Icon name="check" :size="22" class="text-ok shrink-0" />
          <span>{{ t('pwa.iosStep3') }}</span>
        </div>
      </div>
    </BottomSheet>
  </Scaffold>
</template>
