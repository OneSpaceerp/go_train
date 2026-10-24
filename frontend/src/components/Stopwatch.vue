<script setup>
import { ref, onUnmounted, computed } from 'vue'
import Icon from './Icon.vue'

// A simple stopwatch. Emits `use` with elapsed seconds so a log can record duration.
const emit = defineEmits(['use', 'close'])
const elapsed = ref(0)
const running = ref(false)
let timer = null

function tick() { elapsed.value += 1 }
function toggle() {
  running.value = !running.value
  if (running.value) timer = setInterval(tick, 1000)
  else clearInterval(timer)
}
function reset() { clearInterval(timer); running.value = false; elapsed.value = 0 }
onUnmounted(() => clearInterval(timer))

const label = computed(() => {
  const m = Math.floor(elapsed.value / 60), s = elapsed.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center" @click.self="emit('close')">
    <div class="absolute inset-0 bg-[#000c48]/55"></div>
    <div class="relative w-full max-w-[36rem] bg-surface rounded-t-sheet p-6 pb-8" style="padding-bottom: calc(2rem + env(safe-area-inset-bottom))">
      <div class="mx-auto w-20 h-1 rounded-full bg-line mb-5"></div>
      <p class="text-center text-5xl font-bold tabular-nums tracking-tight">{{ label }}</p>
      <div class="flex gap-3 justify-center mt-6">
        <button class="btn-outline w-28" @click="reset">Reset</button>
        <button class="btn-primary w-28" @click="toggle">
          <Icon :name="running ? 'x' : 'timer'" :size="18" />{{ running ? 'Pause' : 'Start' }}
        </button>
      </div>
      <button class="btn-soft w-full mt-4" :disabled="!elapsed" @click="emit('use', elapsed)">
        Use {{ label }} as duration
      </button>
    </div>
  </div>
</template>
