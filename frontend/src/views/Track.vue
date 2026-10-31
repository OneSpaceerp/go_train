<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import BottomSheet from '../components/BottomSheet.vue'
import { onScreenReturn } from '../lib/useScreen.js'
import { api } from '../lib/api.js'
import { shortDate } from '../lib/format.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const route = useRoute()
const insights = ref(api.cached('/insights') || null)
const series = ref(api.cached('/tracking') || [])
const exercises = ref(api.cached('/exercises') || [])
const loading = ref(!series.value.length && !insights.value)

// Log PR / Metric BottomSheet
const showAdd = ref(false)
const metric = ref('')
const value = ref('')
const unit = ref('kg')
const notes = ref('')
const saving = ref(false)

async function load() {
  try {
    ;[insights.value, series.value, exercises.value] = await Promise.all([
      api.get('/insights'),
      api.get('/tracking'),
      api.get('/exercises').catch(() => []),
    ])
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (route.query.metric) {
    metric.value = String(route.query.metric)
    showAdd.value = true
  }
  await load()
})
onScreenReturn(load)

function openAdd(prefill = '') {
  haptics.tap()
  if (prefill) metric.value = prefill
  showAdd.value = true
}

async function addEntry() {
  if (!metric.value.trim() || value.value === '' || value.value == null) return
  saving.value = true
  haptics.medium()
  try {
    await api.post('/tracking', {
      metric: metric.value.trim(),
      value: Number(value.value),
      unit: unit.value || 'kg',
      notes: notes.value,
    })
    haptics.success()
    metric.value = ''
    value.value = ''
    notes.value = ''
    showAdd.value = false
    series.value = await api.get('/tracking')
  } finally {
    saving.value = false
  }
}

// Build an SVG polyline and area fill for a metric series within a 0..100 x 0..40 viewbox.
function path(points) {
  if (points.length < 2) return ''
  const xs = points.map((_, i) => (i / (points.length - 1)) * 100)
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  return points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${(36 - ((p.value - min) / span) * 30).toFixed(1)}`,
    )
    .join(' ')
}

function areaPath(points) {
  const line = path(points)
  if (!line) return ''
  return `${line} L100,40 L0,40 Z`
}

const last = (pts) => pts[pts.length - 1]
function delta(pts) {
  if (!pts || pts.length < 2) return null
  const diff = +(pts[pts.length - 1].value - pts[0].value).toFixed(1)
  if (diff === 0) return null
  return diff > 0 ? `+${diff}` : `${diff}`
}

const quickMetrics = [
  'Back Squat',
  'Deadlift',
  'Bench Press',
  'Overhead Press',
  'Snatch',
  'Clean & Jerk',
  'Bodyweight',
]
</script>

<template>
  <Scaffold :title="t('tab.track')" tab :onRefresh="load">
    <template #actions>
      <button
        type="button"
        class="btn-soft !min-h-[40px] !px-3.5 mr-1 text-xs"
        @click="openAdd()"
      >
        <Icon name="plus" :size="16" />
        {{ t('track.logPr') }}
      </button>
    </template>

    <!-- 30-Day Consistency Ring & Insights -->
    <div v-if="insights" class="card p-5 mt-3 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold text-ink">{{ t('track.consistency') }}</h2>
        <span
          v-if="insights.avg_rpe"
          class="pill border-line bg-surface-sunk text-ink-soft tabular-nums"
        >
          {{ t('track.avgRpe') }} {{ insights.avg_rpe }}
        </span>
      </div>

      <div class="flex items-center gap-5 my-1">
        <div class="relative w-32 h-32 shrink-0">
          <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="rgb(var(--sunk))"
              stroke-width="3.4"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#F23D46"
              stroke-width="3.4"
              stroke-linecap="round"
              :stroke-dasharray="`${insights.completion} 100`"
              pathLength="100"
            />
          </svg>
          <div class="absolute inset-0 grid place-items-center">
            <div class="text-center">
              <p class="text-2xl font-bold tabular-nums text-ink">
                {{ insights.completion }}%
              </p>
              <p class="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-mute">
                {{ t('track.completed') }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex-1 grid grid-cols-2 gap-2.5">
          <div class="p-3 rounded-2xl bg-surface-sunk">
            <p class="text-xl font-bold tabular-nums text-ok">{{ insights.done }}</p>
            <p class="text-xs font-medium text-ink-mute">{{ t('track.completed') }}</p>
          </div>
          <div class="p-3 rounded-2xl bg-surface-sunk">
            <p class="text-xl font-bold tabular-nums text-bad">{{ insights.missed }}</p>
            <p class="text-xs font-medium text-ink-mute">{{ t('track.missed') }}</p>
          </div>
          <div class="col-span-2 p-3 rounded-2xl bg-surface-sunk flex items-center justify-between">
            <span class="text-xs font-medium text-ink-mute">Total Sessions Logged</span>
            <span class="text-base font-bold tabular-nums text-ink">{{ insights.logged }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tracked Metrics & PR Sparklines -->
    <div class="flex items-center justify-between px-1 mb-2">
      <p class="section-label">{{ t('track.prsAndMetrics') }}</p>
      <span class="text-xs text-ink-mute tabular-nums">{{ series.length }} movements</span>
    </div>

    <div v-if="loading" class="card p-4 h-28 animate-pulse bg-surface-sunk"></div>
    <EmptyState
      v-else-if="!series.length"
      icon="trophy"
      title="No benchmarks yet"
      :subtitle="t('track.emptyMetrics')"
    >
      <button type="button" class="btn-primary mt-4" @click="openAdd()">
        <Icon name="plus" :size="18" />
        {{ t('track.logPr') }}
      </button>
    </EmptyState>

    <div v-else class="space-y-3">
      <div
        v-for="s in series"
        :key="s.metric"
        class="card p-4 active:scale-[0.99] transition cursor-pointer"
        @click="openAdd(s.metric)"
      >
        <div class="flex items-baseline justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0">
              <Icon name="trophy" :size="16" />
            </div>
            <p class="font-bold text-ink truncate">{{ s.metric }}</p>
          </div>
          <div class="flex items-baseline gap-2 shrink-0">
            <span
              v-if="delta(s.points)"
              class="pill border-ok/30 bg-ok/10 text-ok !py-0.5 !px-2 !text-xs tabular-nums"
            >
              {{ delta(s.points) }} {{ s.unit }}
            </span>
            <p class="tabular-nums">
              <span class="font-bold text-lg text-ink">{{ last(s.points).value }}</span>
              <span class="text-xs font-medium text-ink-mute"> {{ s.unit }}</span>
            </p>
          </div>
        </div>

        <svg
          v-if="s.points.length > 1"
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          class="w-full h-16 my-1"
        >
          <path :d="areaPath(s.points)" fill="rgba(242, 61, 70, 0.10)" />
          <path
            :d="path(s.points)"
            fill="none"
            stroke="#F23D46"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <div class="flex items-center justify-between text-xs text-ink-mute mt-1 tabular-nums">
          <span>
            {{
              s.points.length > 1
                ? `${shortDate(s.points[0].date)} → ${shortDate(last(s.points).date)}`
                : `Logged on ${shortDate(last(s.points).date)}`
            }}
          </span>
          <span>
            {{ s.points.length }} {{ s.points.length === 1 ? 'entry' : 'entries' }} · Tap to add
          </span>
        </div>
      </div>
    </div>

    <!-- iOS Modal Sheet for Logging PR / Metric -->
    <BottomSheet
      :open="showAdd"
      :title="t('track.logPr')"
      @close="showAdd = false"
    >
      <form class="space-y-3.5 pb-2" @submit.prevent="addEntry">
        <div>
          <p class="section-label mb-2">Quick Select Movement</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="qm in quickMetrics"
              :key="qm"
              type="button"
              class="min-h-[38px] px-3 rounded-full text-xs font-semibold transition"
              :class="
                metric === qm
                  ? 'bg-brand-650 text-white'
                  : 'bg-surface-sunk text-ink-soft'
              "
              @click="haptics.select(); metric = qm"
            >
              {{ qm }}
            </button>
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1">
            Movement or Body Metric
          </label>
          <input
            v-model="metric"
            list="go-train-exercises"
            class="field"
            placeholder="e.g. Back Squat, Fran, Bodyweight"
            required
          />
          <datalist id="go-train-exercises">
            <option v-for="e in exercises" :key="e.id" :value="e.name" />
          </datalist>
        </div>

        <div class="grid grid-cols-[1fr_7.5rem] gap-2.5">
          <div>
            <label class="text-xs font-semibold text-ink-soft block mb-1">Value</label>
            <input
              v-model="value"
              type="number"
              step="any"
              inputmode="decimal"
              class="field tabular-nums"
              placeholder="120"
              required
            />
          </div>
          <div>
            <label class="text-xs font-semibold text-ink-soft block mb-1">Unit</label>
            <select v-model="unit" class="field">
              <option value="kg">kg</option>
              <option value="lb">lb</option>
              <option value="reps">reps</option>
              <option value="sec">sec</option>
              <option value="min">min</option>
              <option value="cm">cm</option>
              <option value="%">%</option>
            </select>
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1">Notes (optional)</label>
          <input
            v-model="notes"
            class="field"
            placeholder="e.g. 1RM beltless, felt smooth"
          />
        </div>

        <button type="submit" class="btn-primary w-full mt-2" :disabled="saving">
          <Icon name="check" :size="18" />
          {{ saving ? 'Saving…' : 'Save Benchmark' }}
        </button>
      </form>
    </BottomSheet>
  </Scaffold>
</template>
