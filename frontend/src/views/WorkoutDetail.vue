<script setup>
// Workout screen, two modes:
//  • Athlete (logging): one card per movement with the coach's demo, set rows
//    (kg · reps · ✓), and a form-check photo/video or YouTube link; score,
//    RPE and notes; a sticky Save bar.
//  • Coach (building, when they own the program and are in Coach view): edit
//    the movements — sets, reps, load, rest, cues and a demo per movement.
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import StatusPill from '../components/StatusPill.vue'
import Icon from '../components/Icon.vue'
import Stopwatch from '../components/Stopwatch.vue'
import ActionSheet from '../components/ActionSheet.vue'
import BottomSheet from '../components/BottomSheet.vue'
import MediaThumb from '../components/MediaThumb.vue'
import MediaViewer from '../components/MediaViewer.vue'
import MediaInput from '../components/MediaInput.vue'
import MovementEditorSheet from '../components/MovementEditorSheet.vue'
import ExercisePicker from '../components/ExercisePicker.vue'
import SwipeRow from '../components/SwipeRow.vue'
import { api, uploadFile } from '../lib/api.js'
import { session, isCoach } from '../lib/session.js'
import { niceDate } from '../lib/format.js'
import { highlight } from '../lib/search.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'
import { mediaKind } from '../lib/media.js'
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
const loadError = ref('')

const coachMode = computed(() => Boolean(w.value?.can_edit) && isCoach())
const weightUnit = computed(() => session.user?.settings?.default_weight_unit || 'kg')

// ---------------------------------------------------------------- movements
// [{ key, exercise, prescribed, sets: [{ weight, reps, completed }], media }]
const movements = ref([])
let keySeq = 0

const numericLoad = (value) => {
  const m = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)?$/i)
  return m ? m[1] : ''
}

function seedSets(ex) {
  const count = Math.min(12, Math.max(1, parseInt(ex?.sets, 10) || 1))
  const reps = parseInt(ex?.reps, 10) || ''
  return Array.from({ length: count }, () => ({ weight: numericLoad(ex?.weight), reps: reps ? String(reps) : '', completed: false }))
}

function buildMovements(detail) {
  const list = []
  const byName = new Map()
  const ensure = (name, prescribed = null) => {
    const k = name || ''
    if (!byName.has(k)) {
      const m = { key: ++keySeq, exercise: name || '', prescribed, sets: [], media: null }
      byName.set(k, m)
      list.push(m)
    }
    const m = byName.get(k)
    if (prescribed && !m.prescribed) m.prescribed = prescribed
    return m
  }
  for (const ex of detail.exercises || []) ensure(ex.exercise, ex)
  for (const s of detail.log?.set_logs || []) {
    ensure(s.exercise).sets.push({ weight: s.weight ? String(s.weight) : '', reps: s.reps ? String(s.reps) : '', completed: Boolean(s.completed) })
  }
  for (const m of list) if (!m.sets.length) m.sets = m.prescribed ? seedSets(m.prescribed) : [{ weight: '', reps: '', completed: false }]
  for (const item of detail.log?.movement_media || []) {
    ensure(item.exercise).media = { media: item.media, video_url: item.video_url || '', note: item.note || '' }
  }
  return list
}

const prescriptionText = (ex) => {
  if (!ex) return ''
  const parts = []
  if (ex.sets || ex.reps) parts.push([ex.sets, ex.reps].filter(Boolean).join(' × '))
  if (ex.weight) parts.push(`@ ${ex.weight}`)
  if (ex.rest) parts.push(`${t('movement.rest', 'Rest')} ${ex.rest}`)
  return parts.join('  ·  ')
}
const demoOf = (ex) => (ex && (ex.media || ex.video_url || ex.library_video_url) ? { media: ex.media, video_url: ex.video_url || ex.library_video_url } : null)
const doneCount = (m) => m.sets.filter((s) => s.completed).length

function addSet(m) {
  haptics.tap()
  const last = m.sets[m.sets.length - 1]
  m.sets.push({ weight: last?.weight ?? '', reps: last?.reps ?? '', completed: false })
}

function removeSet(m, idx) {
  m.sets.splice(idx, 1)
  if (!m.sets.length && !m.prescribed) movements.value = movements.value.filter((x) => x !== m)
}

function toggleSet(set) {
  set.completed = !set.completed
  if (set.completed) {
    haptics.medium()
    startRestTimer(90)
  } else {
    haptics.select()
  }
}

// Set options (non-gesture alternative to swipe-to-delete)
const setMenu = ref(null) // { m, idx }
const setActions = computed(() => [
  { key: 'duplicate', label: t('sets.duplicate', 'Duplicate set'), icon: 'plus' },
  { key: 'delete', label: t('sets.delete', 'Delete set'), icon: 'trash', destructive: true },
])
function onSetAction(key) {
  const target = setMenu.value
  if (!target) return
  if (key === 'duplicate') target.m.sets.splice(target.idx + 1, 0, { ...target.m.sets[target.idx], completed: false })
  if (key === 'delete') removeSet(target.m, target.idx)
}

// Athlete adds a movement that isn't prescribed
const showPicker = ref(false)
function addMovement(name) {
  if (movements.value.some((m) => m.exercise === name)) return
  movements.value.push({ key: ++keySeq, exercise: name, prescribed: null, sets: [{ weight: '', reps: '', completed: false }], media: null })
  haptics.success()
}

// Athlete form check per movement
const formCheck = ref(null) // movement being edited
const formValue = ref({ media: null, video_url: '', note: '' })
function openFormCheck(m) {
  haptics.tap()
  formValue.value = { media: null, video_url: '', note: '', ...(m.media || {}) }
  formCheck.value = m
}
function saveFormCheck() {
  const v = formValue.value
  formCheck.value.media = v.media || v.video_url ? { ...v } : null
  formCheck.value = null
}

// Media viewer (demo or form check)
const viewing = ref(null) // { title, item }
function view(title, item) {
  haptics.tap()
  viewing.value = { title, item }
}

// ---------------------------------------------------------------- coach editor
const editor = ref({ open: false, index: -1, saving: false, error: '' })
const editorMovement = computed(() => (editor.value.index >= 0 ? w.value?.exercises?.[editor.value.index] : null))

function openEditor(index = -1) {
  haptics.tap()
  editor.value = { open: true, index, saving: false, error: '' }
}

async function persistMovements(list) {
  editor.value.saving = true
  editor.value.error = ''
  try {
    const detail = await api.post(`/workouts/${route.params.id}/movements`, {
      movements: list.map((ex) => ({
        exercise: ex.exercise,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        rest: ex.rest,
        notes: ex.notes,
        media: ex.media,
        video_url: ex.video_url,
      })),
    })
    apply(detail)
    haptics.success()
    editor.value.open = false
  } catch (err) {
    haptics.error()
    editor.value.error = err?.message || t('movement.saveFailed', 'Could not save the movement')
  } finally {
    editor.value.saving = false
  }
}

function saveMovement(movement) {
  const list = [...(w.value.exercises || [])]
  if (editor.value.index >= 0) list.splice(editor.value.index, 1, movement)
  else list.push(movement)
  persistMovements(list)
}

function deleteMovement() {
  const list = [...(w.value.exercises || [])]
  list.splice(editor.value.index, 1)
  persistMovements(list)
}

// ---------------------------------------------------------------- result
const result = ref('')
const details = ref('')
const rpe = ref(null)
const duration = ref(null)
const attachment = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const queuedOffline = ref(false)
const showTimer = ref(false)

const RPE_DESC = {
  1: 'Very light', 2: 'Light', 3: 'Moderate', 4: 'Somewhat hard', 5: 'Challenging',
  6: 'Hard · 4 RIR', 7: 'Vigorous · 3 RIR', 8: 'Heavy · 2 RIR', 9: 'Near max · 1 RIR', 10: 'Max effort',
}

const durationLabel = computed(() => {
  if (duration.value == null) return ''
  return `${Math.floor(duration.value / 60)}m ${String(duration.value % 60).padStart(2, '0')}s`
})

function apply(detail) {
  w.value = detail
  logs.value = detail.logs || []
  const latest = detail.log
  result.value = latest?.result || ''
  details.value = latest?.details || ''
  rpe.value = latest?.rpe || null
  duration.value = latest?.duration_seconds ?? null
  attachment.value = latest?.attachment_url ? { url: latest.attachment_url, name: latest.attachment_name } : null
  movements.value = buildMovements(detail)
}

async function load() {
  loadError.value = ''
  try {
    apply(await api.get(`/workouts/${route.params.id}`))
    await nextTick()
    runFind()
  } catch (err) {
    loadError.value = err?.message || t('workout.loadFailed', 'Could not load this workout')
  }
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
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
  saveError.value = ''
  queuedOffline.value = false
  haptics.medium()
  try {
    const setLogs = []
    for (const m of movements.value) {
      m.sets
        .filter((s) => s.completed || s.weight !== '' || s.reps !== '')
        .forEach((s, i) =>
          setLogs.push({ exercise: m.exercise, set_no: i + 1, weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, completed: s.completed ? 1 : 0 }),
        )
    }
    if (!result.value.trim() && setLogs.length) {
      const top = setLogs.reduce((a, b) => (b.weight > a.weight ? b : a), setLogs[0])
      result.value = `${setLogs.length} sets · Top: ${top.exercise} ${top.weight ? `${top.weight} ${weightUnit.value}` : ''} × ${top.reps || 1}`.trim()
    }
    const res = await api.post(`/workouts/${route.params.id}/log`, {
      status,
      result: result.value,
      details: details.value,
      rpe: rpe.value,
      duration_seconds: duration.value,
      attachment_url: attachment.value?.url || null,
      attachment_name: attachment.value?.name || null,
      set_logs: setLogs,
      movement_media: movements.value
        .filter((m) => m.exercise && m.media && (m.media.media || m.media.video_url))
        .map((m) => ({ exercise: m.exercise, media: m.media.media, video_url: m.media.video_url, note: m.media.note })),
    })
    haptics.success()
    saved.value = true
    setTimeout(() => (saved.value = false), 2200)
    if (res?.queued) queuedOffline.value = true
    else await load()
  } catch (err) {
    saveError.value = err?.message || t('workout.saveFailed', 'Could not save your result')
    haptics.error()
  } finally {
    saving.value = false
  }
}

function useTimer(sec) {
  duration.value = sec
  showTimer.value = false
}

// ---------------------------------------------------------------- comments
const comment = ref('')
const commentError = ref('')
async function addComment() {
  if (!comment.value.trim()) return
  haptics.tap()
  commentError.value = ''
  try {
    const c = await api.post(`/workouts/${route.params.id}/comments`, { body: comment.value })
    w.value.comments.push(c)
    comment.value = ''
  } catch (err) {
    commentError.value = err?.message || 'Could not post your comment'
    haptics.error()
  }
}

// ---------------------------------------------------------------- rest timer
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
      sendLocalNotification({ title: 'Rest complete', body: `Time for your next set of ${w.value?.title || 'training'}!`, tag: 'gotrain-rest-timer' })
    }
  }, 1000)
}
function adjustRest(delta) {
  haptics.select()
  restRemaining.value = Math.max(0, restRemaining.value + delta)
  if (!restRemaining.value) clearInterval(restInterval)
}
function skipRest() {
  haptics.tap()
  clearInterval(restInterval)
  restRemaining.value = 0
}
const restLabel = computed(() => `${Math.floor(restRemaining.value / 60)}:${String(restRemaining.value % 60).padStart(2, '0')}`)

// ---------------------------------------------------------------- more menu / find
const showMore = ref(false)
const showFind = ref(false)
const moreActions = computed(() => [
  { key: 'find', label: t('workout.find', 'Find in workout'), icon: 'search' },
  { key: 'awake', label: t('workout.keepAwake', 'Keep screen awake'), icon: 'sun', detail: wakeLockActive.value ? t('common.on', 'On') : t('common.off', 'Off') },
  { key: 'share', label: t('workout.share', 'Share workout'), icon: 'share' },
])
function onMore(key) {
  if (key === 'find') {
    showFind.value = true
    nextTick(() => document.getElementById('workout-find')?.focus())
  }
  if (key === 'awake') toggleWakeLock()
  if (key === 'share') shareWorkout()
}

async function shareWorkout() {
  if (!w.value) return
  const summary = result.value ? `${w.value.title} — Logged: ${result.value}` : `${w.value.title}\n${w.value.body || ''}`.trim()
  await shareContent({ title: `Go Train · ${w.value.title}`, text: summary, url: window.location.href })
}

const find = ref('')
const content = ref(null)
const matchCount = ref(0)
const matchIdx = ref(0)
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
function closeFind() {
  showFind.value = false
  find.value = ''
  nextTick(runFind)
}

onMounted(() => {
  load()
  acquireWakeLock()
})
onUnmounted(() => {
  clearInterval(restInterval)
  releaseWakeLock()
})
</script>

<template>
  <Scaffold :title="w?.title || t('workout.title', 'Workout')" :subtitle="w?.scheduled_on ? niceDate(w.scheduled_on) : ''" back :onRefresh="load">
    <template #actions>
      <button v-if="!coachMode" type="button" class="icon-btn text-accent-ink" :aria-label="t('workout.timerBtn', 'Timer')" @click="haptics.tap(); showTimer = true">
        <Icon name="timer" :size="22" />
      </button>
      <button type="button" class="icon-btn text-accent-ink" :aria-label="t('common.more', 'More')" @click="haptics.tap(); showMore = true">
        <Icon name="more" :size="22" />
      </button>
    </template>

    <p v-if="loadError" class="text-bad text-sm py-4" role="alert">{{ loadError }}</p>

    <div v-if="w" class="py-3 space-y-4">
      <!-- Find in workout (from the ⋯ menu) -->
      <div v-if="showFind" class="flex items-center gap-1.5">
        <label class="field flex items-center gap-2 flex-1 !px-3">
          <Icon name="search" :size="18" class="text-ink-mute" />
          <input
            id="workout-find"
            v-model="find"
            type="search"
            enterkeyhint="search"
            class="flex-1 min-w-0 bg-transparent outline-none text-base"
            :placeholder="t('workout.findPlaceholder', 'Find a movement or cue')"
            dir="auto"
            @input="onFindInput"
          />
          <span v-if="find" class="text-xs font-semibold text-ink-mute tabular-nums">{{ matchCount ? `${matchIdx + 1}/${matchCount}` : '0/0' }}</span>
        </label>
        <button type="button" class="icon-btn" :disabled="matchCount < 2" :aria-label="t('workout.nextMatch', 'Next match')" @click="step(1)">
          <Icon name="chevron" :size="18" class="rotate-90" />
        </button>
        <button type="button" class="text-[0.9375rem] font-medium text-accent-ink min-h-[44px] px-1" @click="closeFind">{{ t('nav.done') }}</button>
      </div>

      <!-- Rest timer: stays pinned under the bar while you scroll -->
      <div v-if="restRemaining > 0" class="rest-bar" role="timer" :aria-label="`${t('workout.restTimer', 'Rest')} ${restLabel}`">
        <div class="flex items-center gap-3 min-w-0">
          <Icon name="timer" :size="22" />
          <div>
            <p class="text-[0.6875rem] uppercase tracking-wider opacity-75 font-semibold">{{ t('workout.restTimer', 'Rest') }}</p>
            <p class="text-2xl font-bold tabular-nums leading-none">{{ restLabel }}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" class="rest-btn" @click="adjustRest(-15)">−15</button>
          <button type="button" class="rest-btn" @click="adjustRest(15)">+15</button>
          <button type="button" class="rest-btn rest-btn--primary" @click="skipRest">{{ t('workout.skipRest', 'Skip') }}</button>
        </div>
      </div>

      <div ref="content" class="space-y-4">
        <!-- Workout overview -->
        <article class="card p-4">
          <div class="flex items-center gap-3">
            <span v-if="w.letter" class="w-9 h-9 rounded-xl bg-ink text-surface grid place-items-center text-sm font-bold shrink-0">{{ w.letter }}</span>
            <h2 class="text-lg font-bold flex-1 text-ink leading-snug" v-html="highlight(w.title, find)"></h2>
            <StatusPill v-if="w.log" :status="w.log.status" />
          </div>
          <p v-if="w.body" class="mt-3 whitespace-pre-line text-ink-soft text-[0.9375rem] leading-relaxed selectable" dir="auto" v-html="highlight(w.body, find)"></p>
        </article>

        <!-- Movements -->
        <section>
          <div class="flex items-end justify-between px-1 mb-2">
            <p class="section-label">{{ t('workout.movements', 'Movements') }}</p>
            <p v-if="!coachMode && movements.length" class="text-xs text-ink-mute">{{ t('sets.swipeHint', 'Swipe a set left to delete') }}</p>
          </div>

          <!-- Coach: build the prescription -->
          <template v-if="coachMode">
            <div v-if="w.exercises?.length" class="space-y-3">
              <article v-for="(ex, i) in w.exercises" :key="ex.row || i" class="card p-4">
                <div class="flex items-start gap-3">
                  <MediaThumb v-if="demoOf(ex)" :item="demoOf(ex)" :size="56" :label="t('movement.playDemo', 'Play demo')" @open="view(ex.exercise, demoOf(ex))" />
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-ink leading-snug" v-html="highlight(ex.exercise, find)"></h3>
                    <p v-if="prescriptionText(ex)" class="text-sm text-ink-soft tabular-nums mt-0.5">{{ prescriptionText(ex) }}</p>
                    <p v-if="ex.notes" class="text-sm text-ink-mute mt-1 whitespace-pre-line" dir="auto">{{ ex.notes }}</p>
                  </div>
                  <button type="button" class="btn-soft !min-h-[44px] !px-3.5" @click="openEditor(i)">
                    <Icon name="edit" :size="16" /> {{ t('common.edit', 'Edit') }}
                  </button>
                </div>
                <button v-if="!demoOf(ex)" type="button" class="add-row mt-3" @click="openEditor(i)">
                  <Icon name="camera" :size="18" /> {{ t('movement.addDemo', 'Add demo video or YouTube link') }}
                </button>
              </article>
            </div>
            <p v-else class="card p-4 text-sm text-ink-mute">{{ t('movement.emptyCoach', 'No movements yet. Add the movements athletes will log, with a demo for each.') }}</p>
            <button type="button" class="btn-outline w-full mt-3" @click="openEditor(-1)">
              <Icon name="plus" :size="18" /> {{ t('movement.add', 'Add movement') }}
            </button>
          </template>

          <!-- Athlete: log sets per movement -->
          <template v-else>
            <div class="space-y-3">
              <article v-for="m in movements" :key="m.key" class="card p-4">
                <div class="flex items-start gap-3 mb-3">
                  <MediaThumb v-if="demoOf(m.prescribed)" :item="demoOf(m.prescribed)" :size="56" :label="t('movement.playDemo', 'Play demo')" @open="view(m.exercise, demoOf(m.prescribed))" />
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-ink leading-snug" v-html="highlight(m.exercise || t('sets.other', 'Other sets'), find)"></h3>
                    <p v-if="prescriptionText(m.prescribed)" class="text-sm text-ink-soft tabular-nums mt-0.5">{{ prescriptionText(m.prescribed) }}</p>
                    <p v-if="m.prescribed?.notes" class="text-sm text-ink-mute mt-1 whitespace-pre-line" dir="auto">{{ m.prescribed.notes }}</p>
                  </div>
                  <span class="text-xs font-semibold tabular-nums shrink-0 mt-1" :class="doneCount(m) && doneCount(m) === m.sets.length ? 'text-ok' : 'text-ink-mute'">
                    {{ doneCount(m) }}/{{ m.sets.length }}
                  </span>
                </div>

                <div class="set-grid set-head" aria-hidden="true">
                  <span>{{ t('sets.set', 'Set') }}</span>
                  <span>{{ weightUnit }}</span>
                  <span>{{ t('workout.reps', 'Reps') }}</span>
                  <span>✓</span>
                </div>
                <div class="space-y-1.5">
                  <SwipeRow v-for="(s, idx) in m.sets" :key="idx" @delete="removeSet(m, idx)">
                    <div class="set-grid set-row" :class="{ 'is-done': s.completed }">
                      <button
                        type="button"
                        class="set-no"
                        :aria-label="t('sets.options', 'Set {n} options', { n: idx + 1 })"
                        @click="haptics.tap(); setMenu = { m, idx }"
                      >
                        {{ idx + 1 }}
                      </button>
                      <input
                        v-model="s.weight"
                        class="set-input"
                        inputmode="decimal"
                        enterkeyhint="next"
                        :aria-label="`${t('sets.set', 'Set')} ${idx + 1} ${weightUnit}`"
                        placeholder="—"
                      />
                      <input
                        v-model="s.reps"
                        class="set-input"
                        inputmode="numeric"
                        enterkeyhint="done"
                        :aria-label="`${t('sets.set', 'Set')} ${idx + 1} ${t('workout.reps', 'Reps')}`"
                        placeholder="—"
                      />
                      <button
                        type="button"
                        class="set-check"
                        :class="{ 'is-done': s.completed }"
                        :aria-pressed="s.completed"
                        :aria-label="`${t('sets.set', 'Set')} ${idx + 1} ${t('sets.done', 'done')}`"
                        @click="toggleSet(s)"
                      >
                        <Icon name="check" :size="20" />
                      </button>
                    </div>
                  </SwipeRow>
                </div>

                <div class="flex items-center gap-2 mt-3">
                  <button type="button" class="add-row flex-1" @click="addSet(m)">
                    <Icon name="plus" :size="18" /> {{ t('sets.add', 'Add set') }}
                  </button>
                  <template v-if="m.exercise">
                    <MediaThumb
                      v-if="m.media && mediaKind(m.media)"
                      :item="m.media"
                      :size="44"
                      :label="t('media.formCheck', 'Form check')"
                      @open="openFormCheck(m)"
                    />
                    <button v-else type="button" class="add-row" @click="openFormCheck(m)">
                      <Icon name="camera" :size="18" /> {{ t('media.formCheck', 'Form check') }}
                    </button>
                  </template>
                </div>
              </article>
            </div>

            <button type="button" class="btn-outline w-full mt-3" @click="haptics.tap(); showPicker = true">
              <Icon name="plus" :size="18" /> {{ t('movement.add', 'Add movement') }}
            </button>
          </template>
        </section>

        <!-- Athlete: result, effort, notes -->
        <section v-if="!coachMode" class="card p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <p class="section-label">{{ t('workout.yourResult', 'Your result') }}</p>
            <span v-if="rpe" class="text-xs font-semibold text-accent-ink truncate">RPE {{ rpe }} · {{ RPE_DESC[rpe] }}</span>
          </div>
          <textarea v-model="result" rows="2" class="field py-3" dir="auto" :placeholder="t('workout.resultPlaceholder', 'Score, e.g. 12:34 Rx or 5 rounds + 8')"></textarea>
          <textarea v-model="details" rows="2" class="field py-3" dir="auto" :placeholder="t('workout.detailsPlaceholder', 'Scaling, how it felt…')"></textarea>

          <div>
            <p class="text-xs font-semibold text-ink-soft mb-2">{{ t('workout.rpeLabel', 'Effort (RPE)') }}</p>
            <div class="grid grid-cols-5 gap-2" role="radiogroup" :aria-label="t('workout.rpeLabel', 'Effort (RPE)')">
              <button
                v-for="n in 10"
                :key="n"
                type="button"
                role="radio"
                :aria-checked="rpe === n"
                class="rpe-btn"
                :class="{ 'is-selected': rpe === n }"
                @click="haptics.select(); rpe = rpe === n ? null : n"
              >
                {{ n }}
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <span v-if="duration != null" class="chip !pe-1">
              <Icon name="clock" :size="16" class="text-accent-ink" /> {{ durationLabel }}
              <button type="button" class="icon-btn !w-8 !h-8 !min-w-[32px] !min-h-[32px]" :aria-label="t('workout.clearDuration', 'Clear duration')" @click="duration = null">
                <Icon name="x" :size="14" />
              </button>
            </span>
            <label class="add-row cursor-pointer" :class="{ 'opacity-60 pointer-events-none': uploading }">
              <Icon name="paperclip" :size="18" />
              {{ uploading ? t('workout.uploading', 'Uploading…') : attachment ? t('workout.replaceMedia', 'Replace photo / video') : t('workout.attachBtn', 'Photo or video') }}
              <input type="file" class="sr-only" accept="image/*,video/*" @change="onFile" />
            </label>
            <MediaThumb v-if="attachment" :item="{ media: attachment.url }" :size="44" @open="view(w.title, { media: attachment.url })" />
          </div>
          <p v-if="uploadError" class="text-bad text-xs">{{ uploadError }}</p>
        </section>

        <!-- Coach & athlete notes -->
        <section class="card p-4">
          <p class="section-label mb-3">{{ t('workout.comments', 'Notes') }}</p>
          <p v-if="!w.comments.length" class="text-sm text-ink-mute mb-3">{{ t('workout.noComments', 'No notes yet. Ask your coach a question or share how the session felt.') }}</p>
          <div v-for="c in w.comments" :key="c.id" class="flex gap-3 py-2.5 border-t border-line first:border-0">
            <Avatar :name="c.author" :size="36" />
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-ink-mute">
                <span class="text-ink font-semibold">{{ c.author }}</span> · <span class="capitalize">{{ c.author_role }}</span>
              </p>
              <p class="text-[0.9375rem] text-ink mt-0.5 selectable" dir="auto" v-html="highlight(c.body, find)"></p>
            </div>
          </div>
          <form class="flex gap-2 mt-3" @submit.prevent="addComment">
            <input v-model="comment" class="field flex-1" enterkeyhint="send" :placeholder="t('workout.commentPlaceholder', 'Ask your coach or leave a note…')" dir="auto" />
            <button type="submit" class="icon-btn bg-accent text-accent-on !w-[50px] !h-[50px] shrink-0" :aria-label="t('workout.sendComment', 'Send note')">
              <Icon name="send" :size="18" />
            </button>
          </form>
          <p v-if="commentError" class="text-bad text-sm mt-2" role="alert">{{ commentError }}</p>
        </section>

        <!-- Previous results -->
        <section v-if="logs.length" class="card p-4">
          <p class="section-label mb-3">{{ t('workout.leaderboard', 'Previous results') }}</p>
          <div v-for="l in logs" :key="l.id" class="py-3 border-t border-line first:border-0">
            <div class="flex items-center gap-2 mb-1">
              <StatusPill :status="l.status" />
              <span class="text-xs text-ink-mute tabular-nums">{{ niceDate(l.logged_on || l.created_at) }}</span>
              <span v-if="l.rpe" class="pill border-line bg-surface-sunk text-ink-soft ms-auto tabular-nums">RPE {{ l.rpe }}</span>
            </div>
            <p v-if="l.result" class="text-[0.9375rem] font-medium text-ink whitespace-pre-line selectable" dir="auto">{{ l.result }}</p>
          </div>
        </section>
      </div>

      <!-- Room for the sticky action bar -->
      <div v-if="!coachMode" class="h-24" aria-hidden="true"></div>
    </div>

    <!-- Sticky save bar (athlete) -->
    <div v-if="w && !coachMode" class="action-bar">
      <p v-if="saveError" class="text-bad text-sm mb-2" role="alert">{{ saveError }}</p>
      <p v-else-if="queuedOffline" class="text-warn text-sm mb-2" role="status">{{ t('pwa.queued') }}</p>
      <div class="flex gap-2.5">
        <button type="button" class="btn-outline !px-5" :disabled="saving" @click="saveLog('missed')">
          {{ t('workout.missed', 'Missed') }}
        </button>
        <button type="button" class="btn-primary flex-1" :disabled="saving" @click="saveLog('done')">
          <Icon name="check" :size="18" />
          {{ saved ? t('workout.savedToast', 'Saved') : saving ? t('nav.saving', 'Saving…') : w.log ? t('workout.updateResult', 'Update result') : t('workout.saveResult', 'Save workout') }}
        </button>
      </div>
    </div>

    <!-- Sheets -->
    <ActionSheet :open="showMore" :actions="moreActions" @select="onMore" @close="showMore = false" />
    <ActionSheet
      :open="Boolean(setMenu)"
      :title="setMenu ? `${setMenu.m.exercise || t('sets.other', 'Other sets')} · ${t('sets.set', 'Set')} ${setMenu.idx + 1}` : ''"
      :actions="setActions"
      @select="onSetAction"
      @close="setMenu = null"
    />
    <ExercisePicker :open="showPicker" :exclude="movements.map((m) => m.exercise)" @pick="addMovement" @close="showPicker = false" />
    <BottomSheet :open="Boolean(formCheck)" :title="`${t('media.formCheck', 'Form check')} · ${formCheck?.exercise || ''}`" @close="formCheck = null">
      <template #action>
        <button type="button" class="sheet-done" @click="saveFormCheck">{{ t('nav.done') }}</button>
      </template>
      <div class="space-y-4 pb-2">
        <p class="text-sm text-ink-soft">{{ t('media.formCheckHelp', 'Film a set or add a YouTube link so your coach can check your technique.') }}</p>
        <MediaInput v-model="formValue" @preview="view(formCheck?.exercise, $event)" />
        <textarea v-model="formValue.note" rows="2" class="field py-3" dir="auto" :placeholder="t('media.notePlaceholder', 'Note for your coach (optional)')"></textarea>
        <p class="text-xs text-ink-mute">{{ t('media.savedWithWorkout', 'Saved when you save the workout.') }}</p>
      </div>
    </BottomSheet>
    <MovementEditorSheet
      :open="editor.open"
      :movement="editorMovement"
      :saving="editor.saving"
      :error="editor.error"
      @save="saveMovement"
      @delete="deleteMovement"
      @close="editor.open = false"
      @preview="view(editorMovement?.exercise || '', $event)"
    />
    <MediaViewer :open="Boolean(viewing)" :title="viewing?.title || ''" :item="viewing?.item" @close="viewing = null" />

    <Stopwatch v-if="showTimer" @use="useTimer" @close="showTimer = false" />
  </Scaffold>
</template>
