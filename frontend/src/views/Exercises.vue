<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import BottomSheet from '../components/BottomSheet.vue'
import { api } from '../lib/api.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const router = useRouter()
const q = ref('')
const category = ref('')
const exercises = ref(api.cached('/exercises?q=&category=') || [])
const selected = ref(null)
let timer = null

const CATEGORIES = ['', 'Strength', 'WOD', 'Engine', 'Skill', 'Core', 'Mobility']

async function run() {
  const qs = `q=${encodeURIComponent(q.value.trim())}&category=${encodeURIComponent(category.value)}`
  exercises.value = await api.get(`/exercises?${qs}`)
}

onMounted(run)
watch([q, category], () => {
  clearTimeout(timer)
  timer = setTimeout(run, 160)
})

function openExercise(ex) {
  haptics.tap()
  selected.value = ex
}

function logPrFor(ex) {
  haptics.medium()
  selected.value = null
  router.push({ path: '/track', query: { metric: ex.name } })
}
</script>

<template>
  <Scaffold :title="t('train.exercisesTitle')" back :onRefresh="run">
    <!-- Sticky Search + Category Strip -->
    <div class="pt-3 pb-2 space-y-2.5">
      <label class="field flex items-center gap-2">
        <Icon name="search" :size="20" class="text-ink-mute" />
        <input
          v-model="q"
          class="flex-1 bg-transparent outline-none text-base"
          placeholder="Search movements, muscles, equipment…"
          dir="auto"
        />
        <button
          v-if="q"
          type="button"
          class="icon-btn !w-9 !h-9 !min-w-[36px] !min-h-[36px]"
          aria-label="Clear search"
          @click="q = ''"
        >
          <Icon name="x" :size="15" />
        </button>
      </label>

      <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          v-for="cat in CATEGORIES"
          :key="cat || 'all'"
          type="button"
          class="min-h-[38px] px-3.5 rounded-full text-xs font-semibold border transition shrink-0"
          :class="
            category === cat
              ? 'bg-ink text-surface border-ink'
              : 'bg-surface border-line text-ink-soft'
          "
          @click="haptics.select(); category = cat"
        >
          {{ cat || 'All' }}
        </button>
      </div>
    </div>

    <EmptyState
      v-if="!exercises.length"
      icon="dumbbell"
      title="No movements found"
      subtitle="Try clearing your search or selecting another category."
    />

    <div v-else class="card divide-y divide-line overflow-hidden">
      <button
        v-for="e in exercises"
        :key="e.id"
        type="button"
        class="w-full flex items-center gap-3 p-4 text-left active:bg-surface-sunk transition"
        @click="openExercise(e)"
      >
        <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0">
          <Icon name="dumbbell" :size="19" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-ink truncate">{{ e.name }}</p>
          <p class="text-xs text-ink-mute truncate mt-0.5">
            <template v-if="e.primary_muscle">{{ e.primary_muscle }}</template>
            <template v-if="e.primary_muscle && e.equipment"> · </template>
            <template v-if="e.equipment">{{ e.equipment }}</template>
            <template v-if="!e.primary_muscle && !e.equipment">{{ e.sport || 'Functional' }}</template>
          </p>
        </div>
        <span class="pill text-ink-soft border-line bg-surface-sunk shrink-0">
          {{ e.category || 'Strength' }}
        </span>
        <Icon name="chevron" :size="18" class="text-ink-mute shrink-0" />
      </button>
    </div>

    <!-- Exercise Detail BottomSheet -->
    <BottomSheet
      :open="Boolean(selected)"
      :title="selected?.name || ''"
      @close="selected = null"
    >
      <div v-if="selected" class="space-y-4 pb-2">
        <div class="flex flex-wrap gap-2">
          <span v-if="selected.category" class="pill bg-brand-50 text-brand-700 border-brand-200">
            {{ selected.category }}
          </span>
          <span v-if="selected.primary_muscle" class="pill bg-surface-sunk text-ink-soft border-line">
            Muscle: {{ selected.primary_muscle }}
          </span>
          <span v-if="selected.equipment" class="pill bg-surface-sunk text-ink-soft border-line">
            Equipment: {{ selected.equipment }}
          </span>
        </div>

        <p
          v-if="selected.description"
          class="text-[0.9375rem] text-ink-soft whitespace-pre-line leading-relaxed selectable"
        >
          {{ selected.description }}
        </p>
        <p v-else class="text-sm text-ink-mute italic">
          Focus on full range of motion, controlled tempo, and consistent bracing across every set.
        </p>

        <a
          v-if="selected.video_url"
          :href="selected.video_url"
          target="_blank"
          rel="noopener"
          class="btn-outline w-full"
        >
          <Icon name="play" :size="17" />
          Watch Movement Demo
        </a>

        <button type="button" class="btn-primary w-full" @click="logPrFor(selected)">
          <Icon name="trophy" :size="18" />
          Log PR / Benchmark for {{ selected.name }}
        </button>
      </div>
    </BottomSheet>
  </Scaffold>
</template>
