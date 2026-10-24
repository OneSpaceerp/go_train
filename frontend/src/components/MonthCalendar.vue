<script setup>
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import Icon from './Icon.vue'

// A month grid with a status dot under any day that has a scheduled workout.
// `events` = [{ scheduled_on, status, ... }]. Emits `pick` with the ISO date.
const props = defineProps({ events: { type: Array, default: () => [] } })
const emit = defineEmits(['pick'])

const cursor = ref(dayjs().startOf('month'))
const selected = ref(dayjs().format('YYYY-MM-DD'))
const today = dayjs().format('YYYY-MM-DD')

// Map ISO date -> best status for the dot (missed > done > upcoming).
const byDate = computed(() => {
  const m = {}
  for (const e of props.events) {
    const key = dayjs(e.scheduled_on).format('YYYY-MM-DD')
    const rank = { missed: 3, done: 2 }[e.status] || 1
    if (!m[key] || rank > m[key].rank) m[key] = { status: e.status || 'upcoming', rank }
  }
  return m
})

const grid = computed(() => {
  const start = cursor.value.startOf('month').startOf('week')
  return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'))
})
const inMonth = (d) => d.month() === cursor.value.month()
const dotClass = (d) => {
  const s = byDate.value[d.format('YYYY-MM-DD')]
  if (!s) return ''
  return { missed: 'bg-bad', done: 'bg-ok', upcoming: 'bg-brand-500' }[s.status]
}
function pick(d) {
  selected.value = d.format('YYYY-MM-DD')
  emit('pick', selected.value)
}
const shift = (n) => { cursor.value = cursor.value.add(n, 'month') }
</script>

<template>
  <div class="card p-3">
    <div class="flex items-center justify-between px-1 mb-2">
      <button class="icon-btn w-9 h-9" aria-label="Previous month" @click="shift(-1)">
        <Icon name="back" :size="18" />
      </button>
      <span class="font-semibold text-sm">{{ cursor.format('MMMM YYYY') }}</span>
      <button class="icon-btn w-9 h-9" aria-label="Next month" @click="shift(1)">
        <Icon name="chevron" :size="18" />
      </button>
    </div>
    <div class="grid grid-cols-7 text-center text-[0.7rem] text-ink-soft mb-1">
      <div v-for="d in ['Su','Mo','Tu','We','Th','Fr','Sa']" :key="d">{{ d }}</div>
    </div>
    <div class="grid grid-cols-7 gap-y-1 text-center">
      <button v-for="d in grid" :key="d.toString()" class="py-0.5 flex flex-col items-center" @click="pick(d)">
        <span class="w-9 h-9 grid place-items-center rounded-full text-sm transition"
          :class="[
            d.format('YYYY-MM-DD') === selected ? 'bg-brand-600 text-white font-semibold'
              : d.format('YYYY-MM-DD') === today ? 'ring-1 ring-brand-300 text-ink'
              : inMonth(d) ? 'text-ink' : 'text-ink-mute/50',
          ]">{{ d.format('D') }}</span>
        <span class="mt-0.5 w-1.5 h-1.5 rounded-full" :class="dotClass(d) || 'bg-transparent'"></span>
      </button>
    </div>
  </div>
</template>
