<script setup>
import { ref, onUnmounted, computed } from 'vue'
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import { haptics } from '../lib/haptics.js'

// Multi-mode Training Timer Sheet:
// 1. Stopwatch (counts up; emits `use` with elapsed seconds for workout log duration)
// 2. Rest / Countdown Timer (quick presets: 60s, 90s, 2m, 3m, 5m with chime + haptics)
const emit = defineEmits(['use', 'close'])

const mode = ref('stopwatch') // 'stopwatch' | 'countdown'
const elapsed = ref(0)
const countdownTotal = ref(90)
const countdownLeft = ref(90)
const running = ref(false)
let timer = null

const PRESETS = [
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2:00', seconds: 120 },
  { label: '3:00', seconds: 180 },
  { label: '5:00', seconds: 300 },
]

function switchMode(m) {
  haptics.select()
  pause()
  mode.value = m
}

function selectPreset(sec) {
  haptics.select()
  pause()
  countdownTotal.value = sec
  countdownLeft.value = sec
}

function tick() {
  if (mode.value === 'stopwatch') {
    elapsed.value += 1
  } else {
    if (countdownLeft.value > 1) {
      countdownLeft.value -= 1
    } else {
      countdownLeft.value = 0
      pause()
      haptics.timerComplete()
    }
  }
}

function toggle() {
  haptics.medium()
  if (running.value) {
    pause()
  } else {
    if (mode.value === 'countdown' && countdownLeft.value === 0) {
      countdownLeft.value = countdownTotal.value
    }
    running.value = true
    timer = setInterval(tick, 1000)
  }
}

function pause() {
  clearInterval(timer)
  running.value = false
}

function reset() {
  haptics.tap()
  pause()
  if (mode.value === 'stopwatch') elapsed.value = 0
  else countdownLeft.value = countdownTotal.value
}

function useElapsed() {
  haptics.success()
  emit('use', elapsed.value)
}

onUnmounted(() => clearInterval(timer))

const activeSeconds = computed(() =>
  mode.value === 'stopwatch' ? elapsed.value : countdownLeft.value,
)

const label = computed(() => {
  const m = Math.floor(activeSeconds.value / 60)
  const s = activeSeconds.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const progressPct = computed(() => {
  if (mode.value !== 'countdown' || !countdownTotal.value) return 0
  return Math.round(((countdownTotal.value - countdownLeft.value) / countdownTotal.value) * 100)
})
</script>

<template>
  <BottomSheet :open="true" title="Training Timer" @close="emit('close')">
    <!-- Segmented Mode Switcher -->
    <div class="grid grid-cols-2 p-1 rounded-full bg-surface-sunk mb-5">
      <button
        type="button"
        class="min-h-[40px] rounded-full text-sm font-semibold transition"
        :class="mode === 'stopwatch' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'"
        @click="switchMode('stopwatch')"
      >
        Stopwatch
      </button>
      <button
        type="button"
        class="min-h-[40px] rounded-full text-sm font-semibold transition"
        :class="mode === 'countdown' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'"
        @click="switchMode('countdown')"
      >
        Rest Timer
      </button>
    </div>

    <!-- Rest Presets -->
    <div v-if="mode === 'countdown'" class="flex justify-center gap-2 mb-4 flex-wrap">
      <button
        v-for="p in PRESETS"
        :key="p.seconds"
        type="button"
        class="min-h-[40px] px-3.5 rounded-full text-xs font-semibold border transition"
        :class="
          countdownTotal === p.seconds
            ? 'bg-brand-650 text-white border-brand-650'
            : 'bg-surface border-line text-ink-soft'
        "
        @click="selectPreset(p.seconds)"
      >
        {{ p.label }}
      </button>
    </div>

    <!-- Large Tabular Clock Display -->
    <div class="py-4 text-center">
      <p class="text-[3.5rem] leading-none font-bold tabular-nums tracking-tight text-ink">
        {{ label }}
      </p>
      <div
        v-if="mode === 'countdown'"
        class="mt-4 mx-auto max-w-[16rem] h-2 rounded-full bg-surface-sunk overflow-hidden"
      >
        <div
          class="h-full bg-brand-600 transition-all duration-300"
          :style="{ width: `${progressPct}%` }"
        ></div>
      </div>
    </div>

    <!-- Primary Controls -->
    <div class="grid grid-cols-2 gap-3 mt-4">
      <button type="button" class="btn-outline" @click="reset">
        Reset
      </button>
      <button type="button" class="btn-primary" @click="toggle">
        <Icon :name="running ? 'pause' : 'play'" :size="18" />
        {{ running ? 'Pause' : 'Start' }}
      </button>
    </div>

    <button
      v-if="mode === 'stopwatch'"
      type="button"
      class="btn-soft w-full mt-3"
      :disabled="!elapsed"
      @click="useElapsed"
    >
      Use {{ label }} as workout duration
    </button>
  </BottomSheet>
</template>
