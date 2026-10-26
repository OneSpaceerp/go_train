<script setup>
import { ref, onMounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import StatusPill from '../components/StatusPill.vue'
import Icon from '../components/Icon.vue'
import Stopwatch from '../components/Stopwatch.vue'
import { api, uploadFile } from '../lib/api.js'
import { niceDate } from '../lib/format.js'
import { highlight } from '../lib/search.js'

const route = useRoute()
const w = ref(null)
const logs = ref([])

// Log form
const result = ref('')
const details = ref('')
const rpe = ref(null)
const duration = ref(null)      // seconds
const attachment = ref(null)    // { url, name }
const uploading = ref(false)
const uploadError = ref('')
const saving = ref(false)
const saved = ref(false)
const showTimer = ref(false)

// Comments
const comment = ref('')

// Find in workout
const find = ref('')
const content = ref(null)
const matchCount = ref(0)
const matchIdx = ref(0)

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
  attachment.value = latest?.attachment_url ? { url: latest.attachment_url, name: latest.attachment_name } : null
  await nextTick(); runFind()
}
onMounted(load)

const durationLabel = computed(() => {
  if (duration.value == null) return ''
  const m = Math.floor(duration.value / 60), s = duration.value % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
})

async function onFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  uploadError.value = ''
  try {
    attachment.value = await uploadFile(file)
  } catch (err) {
    uploadError.value = err.message || 'Could not upload file'
  } finally {
    uploading.value = false
  }
}

async function saveLog(status = 'done') {
  saving.value = true
  try {
    await api.post(`/workouts/${route.params.id}/log`, {
      status, result: result.value, details: details.value,
      rpe: rpe.value, duration_seconds: duration.value,
      attachment_url: attachment.value?.url || null, attachment_name: attachment.value?.name || null,
    })
    saved.value = true
    setTimeout(() => (saved.value = false), 1800)
    await load()
  } finally {
    saving.value = false
  }
}
function useTimer(sec) { duration.value = sec; showTimer.value = false }

async function addComment() {
  if (!comment.value.trim()) return
  const c = await api.post(`/workouts/${route.params.id}/comments`, { body: comment.value })
  w.value.comments.push(c)
  comment.value = ''
  await nextTick(); runFind()
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
  matchIdx.value = (matchIdx.value + dir + matchCount.value) % matchCount.value
  runFind()
}
function onFindInput() { matchIdx.value = 0; nextTick(runFind) }
</script>

<template>
  <Scaffold :title="w?.title || 'Workout'" back>
    <div v-if="w" class="py-4 space-y-4">
      <!-- Find in workout -->
      <div class="flex items-center gap-2">
        <label class="field flex items-center gap-2 flex-1 !h-11">
          <Icon name="search" :size="18" class="text-ink-soft" />
          <input v-model="find" class="flex-1 bg-transparent outline-none" placeholder="Find in workout" dir="auto" @input="onFindInput" />
        </label>
        <template v-if="find">
          <span class="text-xs text-ink-soft tabular-nums w-14 text-right">{{ matchCount ? `${matchIdx + 1}/${matchCount}` : '0/0' }}</span>
          <button class="icon-btn w-9 h-9 bg-surface-sunk" :disabled="matchCount < 2" aria-label="Previous match" @click="step(-1)"><Icon name="back" :size="16" class="rotate-90" /></button>
          <button class="icon-btn w-9 h-9 bg-surface-sunk" :disabled="matchCount < 2" aria-label="Next match" @click="step(1)"><Icon name="chevron" :size="16" class="rotate-90" /></button>
        </template>
      </div>

      <div ref="content" class="space-y-4">
        <article class="card p-4">
          <div class="flex items-center gap-2 mb-1">
            <span v-if="w.letter" class="w-7 h-7 rounded-lg bg-ink text-surface grid place-items-center text-xs font-bold">{{ w.letter }}</span>
            <h2 class="text-lg font-bold flex-1" v-html="highlight(w.title, find)"></h2>
            <StatusPill v-if="w.log" :status="w.log.status" />
          </div>
          <p class="text-sm text-ink-soft mb-3">{{ niceDate(w.scheduled_on) }}</p>
          <p class="whitespace-pre-line text-ink-soft text-[0.9rem]" dir="auto" v-html="highlight(w.body, find)"></p>

          <!-- Structured prescribed exercises (if present) -->
          <div v-if="w.exercises?.length" class="mt-4 pt-3 border-t border-line space-y-2">
            <p class="section-label">Prescribed Movements</p>
            <div v-for="(ex, i) in w.exercises" :key="i" class="flex items-center justify-between text-sm py-1">
              <span class="font-medium">{{ ex.exercise }}</span>
              <span class="text-ink-soft tabular-nums">
                <template v-if="ex.sets">{{ ex.sets }} × </template>{{ ex.reps || '' }}
                <template v-if="ex.weight"> @ {{ ex.weight }}</template>
              </span>
            </div>
          </div>
        </article>

        <!-- Comments (searchable too) -->
        <section class="card p-4">
          <p class="section-label mb-3">Comments</p>
          <div v-if="!w.comments.length" class="text-sm text-ink-soft mb-3">No comments yet.</div>
          <div v-for="c in w.comments" :key="c.id" class="flex gap-3 py-2 border-t border-line first:border-0">
            <Avatar :name="c.author" :size="34" />
            <div class="min-w-0">
              <p class="text-xs text-ink-soft">{{ c.author }} · <span class="capitalize">{{ c.author_role }}</span></p>
              <p class="text-[0.9rem]" dir="auto" v-html="highlight(c.body, find)"></p>
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <input v-model="comment" class="field" placeholder="Write a comment…" dir="auto" @keyup.enter="addComment" />
            <button class="icon-btn bg-brand-600 text-white w-12 h-12" aria-label="Send" @click="addComment"><Icon name="send" :size="18" /></button>
          </div>
        </section>
      </div>

      <!-- Richer log -->
      <section class="card p-4">
        <div class="flex items-center justify-between mb-2">
          <p class="section-label">Log your result</p>
          <button class="btn-soft !h-9" @click="showTimer = true"><Icon name="timer" :size="16" /> Timer</button>
        </div>
        <textarea v-model="result" rows="3" class="field !h-auto py-3 mb-2" dir="auto" placeholder="e.g. 5×5 @ 110 kg or 14:32 Rx"></textarea>
        <textarea v-model="details" rows="2" class="field !h-auto py-3 mb-3" placeholder="Notes (optional)"></textarea>

        <!-- RPE -->
        <p class="text-xs font-medium text-ink-soft mb-1.5">Effort (RPE)</p>
        <div class="flex gap-1 mb-3">
          <button v-for="n in 10" :key="n" class="flex-1 h-9 rounded-lg text-sm font-medium transition"
            :class="rpe === n ? 'bg-brand-600 text-white' : 'bg-surface-sunk text-ink-soft'"
            @click="rpe = rpe === n ? null : n">{{ n }}</button>
        </div>

        <!-- Duration + attachment -->
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span v-if="duration != null" class="pill text-ink-soft border-line bg-surface-sunk">
            <Icon name="clock" :size="14" /> {{ durationLabel }}
            <button class="ml-1" @click="duration = null" aria-label="Clear duration"><Icon name="x" :size="12" /></button>
          </span>
          <label class="btn-soft cursor-pointer">
            <Icon name="share" :size="16" /> {{ uploading ? 'Uploading…' : attachment ? 'Replace file' : 'Attach file' }}
            <input type="file" class="hidden" accept="image/*,video/*,.pdf" @change="onFile" />
          </label>
        </div>
        <p v-if="uploadError" class="text-bad text-xs mb-2">{{ uploadError }}</p>

        <!-- Attachment preview -->
        <div v-if="attachment" class="mb-3">
          <a :href="attachment.url" target="_blank" class="block">
            <img v-if="isImage(attachment.url)" :src="attachment.url" :alt="attachment.name" class="rounded-xl max-h-48 border border-line" />
            <span v-else class="pill text-brand-700 border-brand-200 bg-brand-50"><Icon name="share" :size="14" /> {{ attachment.name }}</span>
          </a>
        </div>

        <div class="flex gap-2">
          <button class="btn-primary flex-1" :disabled="saving" @click="saveLog('done')">
            {{ saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save log' }}
          </button>
          <button class="btn-outline" :disabled="saving" @click="saveLog('missed')">Mark missed</button>
        </div>
      </section>

      <!-- Previous results -->
      <section v-if="logs.length" class="card p-4">
        <p class="section-label mb-3">Previous results</p>
        <div v-for="l in logs" :key="l.id" class="py-3 border-t border-line first:border-0">
          <div class="flex items-center gap-2 mb-1">
            <StatusPill :status="l.status" />
            <span class="text-xs text-ink-soft">{{ niceDate(l.logged_on || l.created_at) }}</span>
            <span v-if="l.rpe" class="text-xs text-ink-soft ml-auto">RPE {{ l.rpe }}</span>
          </div>
          <p v-if="l.result" class="text-[0.9rem] italic whitespace-pre-line" dir="auto">{{ l.result }}</p>
        </div>
      </section>
    </div>

    <Stopwatch v-if="showTimer" @use="useTimer" @close="showTimer = false" />
  </Scaffold>
</template>
