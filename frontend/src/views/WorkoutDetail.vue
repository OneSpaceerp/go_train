<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import StatusPill from '../components/StatusPill.vue'
import Icon from '../components/Icon.vue'
import Stopwatch from '../components/Stopwatch.vue'
import { api, uploadFile } from '../lib/api.js'
import { niceDate } from '../lib/format.js'
import { highlight } from '../lib/search.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'
import {
  wakeLockActive,
  acquireWakeLock,
  releaseWakeLock,
  toggleWakeLock,
  sendLocalNotification,
  shareContent,
} from '../lib/permissions.js'

const route = useRoute()
const w = ref(null)
const logs = ref([])

// Log form state
const result = ref('')
const details = ref('')
const rpe = ref(null)
const duration = ref(null) // seconds
const attachment = ref(null) // { url, name }
const setLogs = ref([]) // [{ exercise, set_no, weight, reps, completed }]
const uploading = ref(false)
const uploadError = ref('')
const saving = ref(false)
const saved = ref(false)
const showTimer = ref(false)

// Inline Rest Timer triggered automatically when ticking a set
const restRemaining = ref(0)
let restInterval = null

function startRestTimer(seconds = 90) {
  clearInterval(restInterval)
  restRemaining.value = seconds
  acquireWakeLock()
  restInterval = setInterval(() => {
    if (restRemaining.value > 1) {
      restRemaining.value -= 1
    } else {
      restRemaining.value = 0
      clearInterval(restInterval)
      haptics.timerComplete()
      sendLocalNotification({
        title: '⏱️ Rest Complete!',
        body: `Time for your next set of ${w.value?.title || 'training'}!`,
        tag: 'gotrain-rest-timer',
      })
    }
  }, 1000)
}

function adjustRest(delta) {
  haptics.select()
  restRemaining.value = Math.max(0, restRemaining.value + delta)
  if (restRemaining.value === 0) clearInterval(restInterval)
}

function skipRest() {
  haptics.tap()
  clearInterval(restInterval)
  restRemaining.value = 0
}

async function shareWorkout() {
  if (!w.value) return
  const summary = result.value
    ? `${w.value.title} — Logged: ${result.value}`
    : `${w.value.title}\n${w.value.body || ''}`.trim()
  await shareContent({
    title: `Go Train · ${w.value.title}`,
    text: summary,
    url: window.location.href,
  })
}

onUnmounted(() => {
  clearInterval(restInterval)
  releaseWakeLock()
})

const restLabel = computed(() => {
  const m = Math.floor(restRemaining.value / 60)
  const s = restRemaining.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

const RPE_DESC = {
  1: '1 · Very Light',
  2: '2 · Light',
  3: '3 · Moderate',
  4: '4 · Somewhat Hard',
  5: '5 · Challenging',
  6: '6 · Hard (4 RIR)',
  7: '7 · Vigorous (3 RIR)',
  8: '8 · Heavy (2 RIR)',
  9: '9 · Near Max (1 RIR)',
  10: '10 · Max Effort (0 RIR)',
}

// Comments
const comment = ref('')

// Find in workout
const find = ref('')
const content = ref(null)
const matchCount = ref(0)
const matchIdx = ref(0)

function buildInitialSets(detail) {
  if (detail.log?.set_logs?.length) {
    return detail.log.set_logs.map((s, idx) => ({
      exercise: s.exercise || '',
      set_no: s.set_no || idx + 1,
      weight: s.weight ?? '',
      reps: s.reps ?? '',
      completed: Boolean(s.completed),
    }))
  }
  if (detail.exercises?.length) {
    const rows = []
    for (const ex of detail.exercises) {
      const count = Math.min(8, Math.max(1, parseInt(ex.sets, 10) || 1))
      const parsedReps = parseInt(ex.reps, 10) || ''
      const parsedWeight = parseFloat(ex.weight) || ''
      for (let i = 1; i <= count; i++) {
        rows.push({
          exercise: ex.exercise || '',
          set_no: i,
          weight: parsedWeight,
          reps: parsedReps,
          completed: false,
        })
      }
    }
    return rows
  }
  return []
}

async function load() {
  const [detail, history] = await Promise.all([
    api.get(`/workouts/${route.params.id}`),
    api.get(`/workouts/${route.params.id}/logs`),
  ])
  w.value = detail
  logs.value = history
  const latest = detail.log
  result.value = latest?.result || ''
  details.value = latest?.details || ''
  rpe.value = latest?.rpe ?? null
  duration.value = latest?.duration_seconds ?? null
  attachment.value = latest?.attachment_url
    ? { url: latest.attachment_url, name: latest.attachment_name }
    : null
  setLogs.value = buildInitialSets(detail)
  await nextTick()
  runFind()
}
onMounted(() => {
  load()
  acquireWakeLock()
})

function addSetRow() {
  haptics.tap()
  const lastRow = setLogs.value[setLogs.value.length - 1]
  setLogs.value.push({
    exercise: lastRow?.exercise || w.value?.exercises?.[0]?.exercise || '',
    set_no: setLogs.value.length + 1,
    weight: lastRow?.weight ?? '',
    reps: lastRow?.reps ?? '',
    completed: false,
  })
}

function removeSetRow(idx) {
  haptics.tap()
  setLogs.value.splice(idx, 1)
  setLogs.value.forEach((s, i) => {
    s.set_no = i + 1
  })
}

function toggleSetDone(row) {
  row.completed = !row.completed
  if (row.completed) {
    haptics.medium()
    startRestTimer(90)
  } else {
    haptics.select()
  }
}

const durationLabel = computed(() => {
  if (duration.value == null) return ''
  const m = Math.floor(duration.value / 60)
  const s = duration.value % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
})

async function onFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  uploadError.value = ''
  try {
    attachment.value = await uploadFile(file)
    haptics.success()
  } catch (err) {
    uploadError.value = err.message || 'Could not upload file'
    haptics.error()
  } finally {
    uploading.value = false
  }
}

async function saveLog(status = 'done') {
  saving.value = true
  haptics.medium()
  try {
    // Auto-summarize completed sets into `result` if athlete left `result` blank
    const validSets = setLogs.value.filter(
      (s) => s.exercise && (s.completed || s.weight !== '' || s.reps !== ''),
    )
    if (!result.value.trim() && validSets.length) {
      const top = validSets[validSets.length - 1]
      result.value = `${validSets.length} sets · Top: ${top.exercise} ${top.weight ? top.weight + ' kg' : ''} × ${top.reps || 1}`.trim()
    }

    await api.post(`/workouts/${route.params.id}/log`, {
      status,
      result: result.value,
      details: details.value,
      rpe: rpe.value,
      duration_seconds: duration.value,
      attachment_url: attachment.value?.url || null,
      attachment_name: attachment.value?.name || null,
      set_logs: validSets.map((s, idx) => ({
        exercise: s.exercise,
        set_no: s.set_no || idx + 1,
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        completed: s.completed ? 1 : 0,
      })),
    })
    haptics.success()
    saved.value = true
    setTimeout(() => (saved.value = false), 2200)
    await load()
  } catch {
    haptics.error()
  } finally {
    saving.value = false
  }
}

function useTimer(sec) {
  duration.value = sec
  showTimer.value = false
}

async function addComment() {
  if (!comment.value.trim()) return
  haptics.tap()
  const c = await api.post(`/workouts/${route.params.id}/comments`, { body: comment.value })
  w.value.comments.push(c)
  comment.value = ''
  await nextTick()
  runFind()
}

const isImage = (url) => /\.(png|jpe?g|gif|webp|heic)$/i.test(url || '')

// ---- Find in workout: number the <mark>s and step through them ----
function runFind() {
  if (!content.value) return
  const marks = content.value.querySelectorAll('mark')
  matchCount.value = marks.length
  if (matchIdx.value >= marks.length) matchIdx.value = 0
  marks.forEach((m, i) => m.classList.toggle('current', i === matchIdx.value))
  marks[matchIdx.value]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
function step(dir) {
  if (!matchCount.value) return
  haptics.select()
  matchIdx.value = (matchIdx.value + dir + matchCount.value) % matchCount.value
  runFind()
}
function onFindInput() {
  matchIdx.value = 0
  nextTick(runFind)
}
</script>

<template>
  <Scaffold :title="w?.title || 'Workout'" :subtitle="w?.scheduled_on ? niceDate(w.scheduled_on) : ''" back :onRefresh="load">
    <template #actions>
      <button
        type="button"
        class="icon-btn"
        :class="wakeLockActive ? 'text-brand-600' : 'text-ink-mute'"
        :aria-label="wakeLockActive ? 'Screen kept awake' : 'Keep screen awake'"
        title="Keep screen awake during workout"
        @click="toggleWakeLock()"
      >
        <Icon name="sun" :size="18" />
      </button>
      <button
        type="button"
        class="icon-btn text-ink-soft"
        aria-label="Share workout"
        @click="shareWorkout"
      >
        <Icon name="share" :size="18" />
      </button>
      <button
        type="button"
        class="btn-soft !min-h-[40px] !px-3 mr-1 text-xs"
        @click="showTimer = true"
      >
        <Icon name="timer" :size="16" />
        {{ t('workout.timerBtn') }}
      </button>
    </template>

    <div v-if="w" class="py-3 space-y-4">
      <!-- Find in workout bar (44pt compliant controls) -->
      <div class="flex items-center gap-1.5">
        <label class="field flex items-center gap-2 flex-1 !min-h-[44px]">
          <Icon name="search" :size="18" class="text-ink-mute" />
          <input
            v-model="find"
            class="flex-1 bg-transparent outline-none text-sm"
            placeholder="Find movement or cue in workout…"
            dir="auto"
            @input="onFindInput"
          />
          <button
            v-if="find"
            type="button"
            class="icon-btn !w-9 !h-9 !min-w-[36px] !min-h-[36px]"
            aria-label="Clear search"
            @click="find = ''; onFindInput()"
          >
            <Icon name="x" :size="15" />
          </button>
        </label>
        <template v-if="find">
          <span class="text-xs font-semibold text-ink-mute tabular-nums px-1">
            {{ matchCount ? `${matchIdx + 1}/${matchCount}` : '0/0' }}
          </span>
          <button
            type="button"
            class="icon-btn bg-surface border border-line"
            :disabled="matchCount < 2"
            aria-label="Previous match"
            @click="step(-1)"
          >
            <Icon name="back" :size="16" class="rotate-90" />
          </button>
          <button
            type="button"
            class="icon-btn bg-surface border border-line"
            :disabled="matchCount < 2"
            aria-label="Next match"
            @click="step(1)"
          >
            <Icon name="chevron" :size="16" class="rotate-90" />
          </button>
        </template>
      </div>

      <!-- Active Rest Timer Banner (appears automatically when ticking a set) -->
      <div
        v-if="restRemaining > 0"
        class="card p-3.5 bg-ink text-surface flex items-center justify-between gap-2 shadow-dock"
      >
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-brand-600 text-white grid place-items-center">
            <Icon name="timer" :size="18" />
          </div>
          <div>
            <p class="text-[0.6875rem] uppercase tracking-wider opacity-75 font-semibold">
              {{ t('workout.restTimer') }}
            </p>
            <p class="text-xl font-bold tabular-nums leading-tight">{{ restLabel }}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="min-h-[40px] px-2.5 rounded-xl bg-white/15 text-xs font-semibold"
            @click="adjustRest(-15)"
          >
            -15s
          </button>
          <button
            type="button"
            class="min-h-[40px] px-2.5 rounded-xl bg-white/15 text-xs font-semibold"
            @click="adjustRest(15)"
          >
            +15s
          </button>
          <button
            type="button"
            class="min-h-[40px] px-3 rounded-xl bg-brand-600 text-white text-xs font-semibold"
            @click="skipRest"
          >
            {{ t('workout.skipRest') }}
          </button>
        </div>
      </div>

      <div ref="content" class="space-y-4">
        <!-- Workout Prescription Card -->
        <article class="card p-4">
          <div class="flex items-center gap-2.5 mb-2">
            <span
              v-if="w.letter"
              class="w-8 h-8 rounded-xl bg-ink text-surface grid place-items-center text-xs font-bold shrink-0"
            >
              {{ w.letter }}
            </span>
            <h2 class="text-lg font-bold flex-1 text-ink" v-html="highlight(w.title, find)"></h2>
            <StatusPill v-if="w.log" :status="w.log.status" />
          </div>

          <p
            class="whitespace-pre-line text-ink-soft text-[0.9375rem] leading-relaxed selectable"
            dir="auto"
            v-html="highlight(w.body, find)"
          ></p>

          <!-- Structured prescribed exercises -->
          <div v-if="w.exercises?.length" class="mt-4 pt-3 border-t border-line space-y-2">
            <p class="section-label">{{ t('workout.prescription') }}</p>
            <div
              v-for="(ex, i) in w.exercises"
              :key="i"
              class="flex items-center justify-between text-sm py-1.5 border-b border-line/40 last:border-0"
            >
              <div>
                <p class="font-semibold text-ink">{{ ex.exercise }}</p>
                <p v-if="ex.notes" class="text-xs text-ink-mute">{{ ex.notes }}</p>
              </div>
              <span class="font-semibold text-ink-soft tabular-nums">
                <template v-if="ex.sets">{{ ex.sets }} × </template>{{ ex.reps || '' }}
                <template v-if="ex.weight"> @ {{ ex.weight }}</template>
              </span>
            </div>
          </div>
        </article>

        <!-- Interactive Set-by-Set Logger (Synced to Workout Log.set_logs & PR Tracker) -->
        <section class="card p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="section-label">{{ t('workout.InteractiveSets') }}</p>
              <p class="text-xs text-ink-mute mt-0.5">
                Log weights &amp; reps per set — highest lifts auto-update your PRs
              </p>
            </div>
            <button
              type="button"
              class="btn-soft !min-h-[38px] !px-3 text-xs"
              @click="addSetRow"
            >
              {{ t('workout.addSet') }}
            </button>
          </div>

          <div v-if="setLogs.length" class="space-y-2">
            <div
              class="grid grid-cols-[2rem_1fr_4.25rem_3.75rem_2.75rem_2.25rem] gap-1.5 items-center text-[0.6875rem] font-bold uppercase tracking-wider text-ink-mute px-1"
            >
              <span>#</span>
              <span>{{ t('workout.exercise') }}</span>
              <span class="text-center">{{ t('workout.weight') }}</span>
              <span class="text-center">{{ t('workout.reps') }}</span>
              <span class="text-center">✓</span>
              <span></span>
            </div>

            <div
              v-for="(row, idx) in setLogs"
              :key="idx"
              class="grid grid-cols-[2rem_1fr_4.25rem_3.75rem_2.75rem_2.25rem] gap-1.5 items-center p-1.5 rounded-2xl border transition"
              :class="
                row.completed
                  ? 'bg-ok/10 border-ok/30'
                  : 'bg-surface-sunk/60 border-line/60'
              "
            >
              <span class="text-xs font-bold tabular-nums text-center text-ink-mute">
                {{ idx + 1 }}
              </span>
              <input
                v-model="row.exercise"
                class="h-10 px-2.5 rounded-xl bg-surface border border-line/80 text-sm font-medium text-ink outline-none focus:border-brand-600 min-w-0"
                placeholder="Movement (e.g. Squat)"
              />
              <input
                v-model="row.weight"
                type="number"
                step="any"
                inputmode="decimal"
                class="h-10 px-1.5 rounded-xl bg-surface border border-line/80 text-sm font-semibold tabular-nums text-center text-ink outline-none focus:border-brand-600"
                placeholder="kg"
              />
              <input
                v-model="row.reps"
                type="number"
                inputmode="numeric"
                class="h-10 px-1.5 rounded-xl bg-surface border border-line/80 text-sm font-semibold tabular-nums text-center text-ink outline-none focus:border-brand-600"
                placeholder="reps"
              />
              <button
                type="button"
                class="w-11 h-11 rounded-xl grid place-items-center transition active:scale-95"
                :class="
                  row.completed
                    ? 'bg-ok text-white shadow-sm'
                    : 'bg-surface border border-line text-ink-mute'
                "
                :aria-label="`Mark set ${idx + 1} complete`"
                @click="toggleSetDone(row)"
              >
                <Icon name="check" :size="18" />
              </button>
              <button
                type="button"
                class="w-9 h-11 rounded-xl grid place-items-center text-ink-mute active:text-bad"
                aria-label="Remove set"
                @click="removeSetRow(idx)"
              >
                <Icon name="x" :size="15" />
              </button>
            </div>
          </div>

          <button
            v-else
            type="button"
            class="w-full py-3 rounded-2xl border border-dashed border-line text-sm font-medium text-ink-soft hover:border-brand-500 transition"
            @click="addSetRow"
          >
            {{ t('workout.addSet') }} (Back Squat, Bench Press, Snatch…)
          </button>
        </section>

        <!-- Overall Score, RPE & Media Log -->
        <section class="card p-4">
          <div class="flex items-center justify-between mb-2.5">
            <p class="section-label">{{ t('workout.yourResult') }}</p>
            <span v-if="rpe" class="text-xs font-semibold text-brand-600">
              {{ RPE_DESC[rpe] }}
            </span>
          </div>

          <textarea
            v-model="result"
            rows="2"
            class="field !min-h-[68px] py-2.5 mb-2.5"
            dir="auto"
            :placeholder="t('workout.resultPlaceholder')"
          ></textarea>
          <textarea
            v-model="details"
            rows="2"
            class="field !min-h-[60px] py-2.5 mb-3.5"
            dir="auto"
            :placeholder="t('workout.detailsPlaceholder')"
          ></textarea>

          <!-- 2x5 RPE Grid (Every button meets 44x44pt Apple HIG touch target minimum) -->
          <p class="text-xs font-semibold text-ink-soft mb-2">{{ t('workout.rpeLabel') }}</p>
          <div class="grid grid-cols-5 gap-1.5 mb-4">
            <button
              v-for="n in 10"
              :key="n"
              type="button"
              class="min-h-[44px] rounded-xl text-sm font-bold tabular-nums transition active:scale-95"
              :class="
                rpe === n
                  ? 'bg-brand-650 text-white shadow-sm'
                  : 'bg-surface-sunk text-ink-soft'
              "
              @click="haptics.select(); rpe = rpe === n ? null : n"
            >
              {{ n }}
            </button>
          </div>

          <!-- Duration + File Attachment -->
          <div class="flex items-center gap-2 mb-3.5 flex-wrap">
            <div
              v-if="duration != null"
              class="inline-flex items-center gap-1.5 pl-3 pr-1 min-h-[44px] rounded-full text-sm font-semibold text-ink bg-surface-sunk border border-line tabular-nums"
            >
              <Icon name="clock" :size="16" class="text-brand-600" />
              <span>{{ durationLabel }}</span>
              <button
                type="button"
                class="icon-btn !w-9 !h-9 !min-w-[36px] !min-h-[36px]"
                aria-label="Clear duration"
                @click="duration = null"
              >
                <Icon name="x" :size="14" />
              </button>
            </div>

            <label class="btn-soft cursor-pointer">
              <Icon name="share" :size="16" />
              {{
                uploading
                  ? t('workout.uploading')
                  : attachment
                    ? 'Replace Media'
                    : t('workout.attachBtn')
              }}
              <input
                type="file"
                class="hidden"
                accept="image/*,video/*,.pdf"
                @change="onFile"
              />
            </label>
          </div>
          <p v-if="uploadError" class="text-bad text-xs mb-2">{{ uploadError }}</p>

          <!-- Attachment preview -->
          <div v-if="attachment" class="mb-3.5">
            <a :href="attachment.url" target="_blank" class="block">
              <img
                v-if="isImage(attachment.url)"
                :src="attachment.url"
                :alt="attachment.name"
                class="rounded-2xl max-h-52 border border-line object-cover"
              />
              <span
                v-else
                class="pill text-brand-700 border-brand-200 bg-brand-50"
              >
                <Icon name="share" :size="14" /> {{ attachment.name }}
              </span>
            </a>
          </div>

          <div class="flex gap-2.5">
            <button
              type="button"
              class="btn-primary flex-1"
              :disabled="saving"
              @click="saveLog('done')"
            >
              <Icon name="check" :size="18" />
              {{
                saved
                  ? t('workout.savedToast')
                  : saving
                    ? 'Saving…'
                    : w.log
                      ? t('workout.updateResult')
                      : t('workout.saveResult')
              }}
            </button>
            <button
              type="button"
              class="btn-outline !px-4 text-xs"
              :disabled="saving"
              @click="saveLog('missed')"
            >
              {{ t('workout.markMissed') }}
            </button>
          </div>
        </section>

        <!-- Coach & Athlete Comments -->
        <section class="card p-4">
          <p class="section-label mb-3">{{ t('workout.comments') }}</p>
          <div v-if="!w.comments.length" class="text-sm text-ink-mute mb-3">
            No notes yet. Ask your coach a question or share how the session felt.
          </div>
          <div
            v-for="c in w.comments"
            :key="c.id"
            class="flex gap-3 py-2.5 border-t border-line first:border-0"
          >
            <Avatar :name="c.author" :size="36" />
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-ink-mute">
                <span class="text-ink font-semibold">{{ c.author }}</span> ·
                <span class="capitalize">{{ c.author_role }}</span>
              </p>
              <p
                class="text-[0.9375rem] text-ink mt-0.5 selectable"
                dir="auto"
                v-html="highlight(c.body, find)"
              ></p>
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <input
              v-model="comment"
              class="field flex-1"
              :placeholder="t('workout.commentPlaceholder')"
              dir="auto"
              @keyup.enter="addComment"
            />
            <button
              type="button"
              class="icon-btn bg-brand-650 text-white w-12 h-12 shrink-0"
              aria-label="Send comment"
              @click="addComment"
            >
              <Icon name="send" :size="18" />
            </button>
          </div>
        </section>

        <!-- Class Leaderboard & Previous Results -->
        <section v-if="logs.length" class="card p-4">
          <p class="section-label mb-3">{{ t('workout.leaderboard') }}</p>
          <div
            v-for="l in logs"
            :key="l.id"
            class="py-3 border-t border-line first:border-0"
          >
            <div class="flex items-center gap-2 mb-1">
              <StatusPill :status="l.status" />
              <span v-if="l.member_name" class="text-sm font-semibold text-ink">
                {{ l.member_name }}
              </span>
              <span class="text-xs text-ink-mute tabular-nums">
                {{ niceDate(l.logged_on || l.created_at) }}
              </span>
              <span v-if="l.rpe" class="pill border-line bg-surface-sunk text-ink-soft ml-auto tabular-nums">
                RPE {{ l.rpe }}
              </span>
            </div>
            <p
              v-if="l.result"
              class="text-[0.9375rem] font-medium text-ink whitespace-pre-line selectable"
              dir="auto"
            >
              {{ l.result }}
            </p>
          </div>
        </section>
      </div>
    </div>

    <Stopwatch v-if="showTimer" @use="useTimer" @close="showTimer = false" />
  </Scaffold>
</template>
