<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'
import { session } from '../lib/session.js'
import { shortDate } from '../lib/format.js'

const insights = ref(null)
const series = ref([])
const exercises = ref([])
const loading = ref(true)

// Log PR / Metric form
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
onMounted(load)

async function addEntry() {
  if (!metric.value.trim() || value.value === '' || value.value == null) return
  saving.value = true
  try {
    await api.post('/tracking', {
      metric: metric.value.trim(),
      value: Number(value.value),
      unit: unit.value || 'kg',
      notes: notes.value,
    })
    metric.value = ''
    value.value = ''
    notes.value = ''
    showAdd.value = false
    series.value = await api.get('/tracking')
  } finally {
    saving.value = false
  }
}

// Build an SVG polyline for a metric series within a 0..100 x 0..40 viewbox.
function path(points) {
  if (points.length < 2) return ''
  const xs = points.map((_, i) => (i / (points.length - 1)) * 100)
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${(38 - ((p.value - min) / span) * 34).toFixed(1)}`).join(' ')
}
const last = (pts) => pts[pts.length - 1]
const quickMetrics = ['Back Squat', 'Deadlift', 'Bench Press', 'Snatch', 'Clean & Jerk', 'Bodyweight']
</script>

<template>
  <Scaffold tab>
    <div class="flex items-center gap-3 pt-5 pb-4">
      <Avatar :name="session.user?.full_name" :url="session.user?.avatar_url" />
      <div class="flex-1 min-w-0">
        <p class="text-xs text-ink-soft">Welcome,</p>
        <p class="font-semibold truncate">{{ session.user?.full_name }}</p>
      </div>
      <button class="btn-soft !h-10 !px-3.5 text-sm" @click="showAdd = !showAdd">
        <Icon name="plus" :size="16" /> Log PR / Metric
      </button>
    </div>

    <!-- Log PR / Metric card -->
    <form v-if="showAdd" class="card p-4 mb-4 space-y-3" @submit.prevent="addEntry">
      <div class="flex items-center justify-between">
        <p class="section-label">Record PR or Body Metric</p>
        <button type="button" class="icon-btn w-8 h-8" @click="showAdd = false" aria-label="Close"><Icon name="x" :size="16" /></button>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="qm in quickMetrics" :key="qm" type="button"
          class="px-2.5 py-1 rounded-full text-xs font-medium transition"
          :class="metric === qm ? 'bg-brand-600 text-white' : 'bg-surface-sunk text-ink-soft'"
          @click="metric = qm">{{ qm }}</button>
      </div>
      <input v-model="metric" list="go-train-exercises" class="field !h-11" placeholder="Metric or movement (e.g. Back Squat)" required />
      <datalist id="go-train-exercises">
        <option v-for="e in exercises" :key="e.id" :value="e.name" />
      </datalist>
      <div class="flex gap-2">
        <input v-model="value" type="number" step="any" class="field !h-11 flex-1" placeholder="Value (e.g. 120)" required />
        <select v-model="unit" class="field !h-11 !w-28">
          <option value="kg">kg</option>
          <option value="lb">lb</option>
          <option value="reps">reps</option>
          <option value="sec">sec</option>
          <option value="min">min</option>
          <option value="cm">cm</option>
          <option value="%">%</option>
        </select>
      </div>
      <input v-model="notes" class="field !h-11" placeholder="Notes (e.g. 1RM beltless)" />
      <button class="btn-primary w-full !h-11" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save entry' }}
      </button>
    </form>

    <!-- Insights -->
    <div v-if="insights" class="card p-5 mb-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-semibold">Your Progress</h2><span class="text-sm text-ink-soft">All time</span>
      </div>
      <div class="flex items-center justify-center my-2">
        <div class="relative w-40 h-40">
          <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgb(var(--sunk))" stroke-width="3" />
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgb(var(--bad))" stroke-width="3"
              stroke-linecap="round" :stroke-dasharray="`${insights.completion} 100`"
              pathLength="100" style="stroke: #F23D46" />
          </svg>
          <div class="absolute inset-0 grid place-items-center">
            <div class="text-center"><p class="text-3xl font-bold">{{ insights.completion }}%</p>
              <p class="text-xs text-ink-soft">completed</p></div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center mt-2">
        <div><p class="text-xl font-bold">{{ insights.done }}</p><p class="text-xs text-ink-soft">Done</p></div>
        <div><p class="text-xl font-bold">{{ insights.missed }}</p><p class="text-xs text-ink-soft">Missed</p></div>
        <div><p class="text-xl font-bold">{{ insights.logged }}</p><p class="text-xs text-ink-soft">Days logged</p></div>
      </div>
    </div>

    <!-- Tracking series -->
    <p class="section-label px-1 mb-2">Tracked metrics</p>
    <div v-if="loading" class="card p-4 h-28 animate-pulse bg-surface-sunk"></div>
    <EmptyState v-else-if="!series.length" icon="track" title="No metrics yet"
      subtitle="Tap 'Log PR / Metric' above or log weighted workout sets to see graphs here." />
    <div v-else class="space-y-3">
      <div v-for="s in series" :key="s.metric" class="card p-4">
        <div class="flex items-baseline justify-between mb-2">
          <p class="font-semibold">{{ s.metric }}</p>
          <p class="text-sm"><span class="font-bold text-base">{{ last(s.points).value }}</span>
            <span class="text-ink-soft"> {{ s.unit }}</span></p>
        </div>
        <svg v-if="s.points.length > 1" viewBox="0 0 100 40" preserveAspectRatio="none" class="w-full h-16">
          <path :d="path(s.points)" fill="none" stroke="#F23D46" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        </svg>
        <p class="text-xs text-ink-soft mt-1">
          {{ s.points.length > 1 ? `${shortDate(s.points[0].date)} → ${shortDate(last(s.points).date)}` : `Logged on ${shortDate(last(s.points).date)}` }}
          <span class="ml-1">({{ s.points.length }} {{ s.points.length === 1 ? 'entry' : 'entries' }})</span>
        </p>
      </div>
    </div>
  </Scaffold>
</template>
