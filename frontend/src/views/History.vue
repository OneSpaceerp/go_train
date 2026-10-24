<script setup>
import { ref, watch, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'
import { highlight, snippet, groupByDate } from '../lib/search.js'

const q = ref('')
const rows = ref([])
const loading = ref(true)
let timer

async function run() {
  loading.value = true
  try { rows.value = await api.get(`/history?q=${encodeURIComponent(q.value.trim())}`) }
  finally { loading.value = false }
}
onMounted(run)
watch(q, () => { clearTimeout(timer); timer = setTimeout(run, 180) })

const suggestions = ['squat', 'deadlift', 'kg', 'run', 'heba']
</script>

<template>
  <Scaffold title="History" back>
    <div class="py-3 sticky top-[60px] z-20 bg-surface-page">
      <label class="field flex items-center gap-2">
        <Icon name="search" :size="20" class="text-ink-soft" />
        <input v-model="q" class="flex-1 bg-transparent outline-none text-base" placeholder="Search workouts, results, comments" dir="auto" />
        <button v-if="q" class="icon-btn w-6 h-6 bg-ink-mute/70 text-surface" @click="q = ''" aria-label="Clear"><Icon name="x" :size="12" /></button>
      </label>
    </div>

    <div v-if="loading && !rows.length" class="space-y-3 pt-2">
      <div v-for="i in 4" :key="i" class="card p-4 h-20 animate-pulse bg-surface-sunk"></div>
    </div>

    <template v-else-if="rows.length">
      <p class="text-sm text-ink-soft mt-1 mb-2 px-1">{{ rows.length }} {{ rows.length === 1 ? 'workout' : 'workouts' }}</p>
      <section v-for="sec in groupByDate(rows)" :key="sec.title">
        <p class="section-label mt-4 mb-2 px-1">{{ sec.title }}</p>
        <div class="card divide-y divide-line">
          <RouterLink v-for="r in sec.rows" :key="r.id" :to="`/workouts/${r.id}`" class="block p-4 active:bg-surface-sunk">
            <div class="flex items-baseline gap-2">
              <span class="font-bold flex-1 truncate" dir="auto" v-html="highlight(r.title, q)"></span>
              <span class="text-sm text-ink-soft tabular-nums">{{ (r.logged_on || r.scheduled_on || '').slice(0, 10) }}</span>
            </div>
            <p class="text-ink-soft text-sm mt-0.5 truncate" dir="auto"
               :class="snippet(r, q).field === 'result' ? 'italic' : ''"
               v-html="highlight(snippet(r, q).text, q)"></p>
            <div class="flex gap-2 mt-2">
              <StatusPill :status="r.status" />
              <span class="pill text-ink-soft border-line bg-surface-sunk">{{ r.program }}</span>
            </div>
          </RouterLink>
        </div>
      </section>
    </template>

    <template v-else>
      <EmptyState v-if="q" icon="search" title="No results" :subtitle="`Nothing matches “${q}”. Try an exercise, a weight like “56 kg”, or a date.`" />
      <div v-else class="pt-2">
        <p class="section-label px-1 mb-2">Try searching</p>
        <div class="flex flex-wrap gap-2 px-1">
          <button v-for="s in suggestions" :key="s" class="btn-soft" @click="q = s">{{ s }}</button>
        </div>
      </div>
    </template>
  </Scaffold>
</template>
