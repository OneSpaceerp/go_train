<script setup>
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import Icon from './Icon.vue'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

// A month grid with a status dot under any day that has a scheduled workout.
// `events` = [{ scheduled_on, status, ... }]. Emits `pick` with the ISO date.
const props = defineProps({
  events: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['pick'])

const cursor = ref(dayjs().startOf('month'))
const selected = ref(props.modelValue || dayjs().format('YYYY-MM-DD'))
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
  haptics.select()
  selected.value = d.format('YYYY-MM-DD')
  emit('pick', selected.value)
}

function jumpToday() {
  haptics.tap()
  cursor.value = dayjs().startOf('month')
  selected.value = today
  emit('pick', today)
}

const shift = (n) => {
  haptics.select()
  cursor.value = cursor.value.add(n, 'month')
}
</script>

<template>
  <div class="card p-3.5">
    <div class="flex items-center justify-between mb-2">
      <button
        type="button"
        class="icon-btn"
        aria-label="Previous month"
        @click="shift(-1)"
      >
        <Icon name="back" :size="19" />
      </button>

      <div class="flex items-center gap-2">
        <span class="font-semibold text-[0.9375rem] text-ink">
          {{ cursor.format('MMMM YYYY') }}
        </span>
        <button
          v-if="selected !== today || !cursor.isSame(dayjs(), 'month')"
          type="button"
          class="min-h-[30px] px-2.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700"
          @click="jumpToday"
        >
          {{ t('nav.today') }}
        </button>
      </div>

      <button
        type="button"
        class="icon-btn"
        aria-label="Next month"
        @click="shift(1)"
      >
        <Icon name="chevron" :size="19" />
      </button>
    </div>

    <div class="grid grid-cols-7 text-center text-xs font-semibold text-ink-mute mb-1">
      <div v-for="d in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']" :key="d" class="py-1">
        {{ d }}
      </div>
    </div>

    <div class="grid grid-cols-7 gap-y-0.5 text-center">
      <button
        v-for="d in grid"
        :key="d.toString()"
        type="button"
        class="min-h-[44px] py-0.5 flex flex-col items-center justify-center rounded-xl transition active:scale-95"
        @click="pick(d)"
      >
        <span
          class="w-9 h-9 grid place-items-center rounded-full text-sm tabular-nums transition"
          :class="[
            d.format('YYYY-MM-DD') === selected
              ? 'bg-brand-650 text-white font-semibold shadow-sm'
              : d.format('YYYY-MM-DD') === today
                ? 'ring-2 ring-brand-400 text-ink font-semibold'
                : inMonth(d)
                  ? 'text-ink'
                  : 'text-ink-mute/50',
          ]"
        >
          {{ d.format('D') }}
        </span>
        <span
          class="mt-0.5 w-1.5 h-1.5 rounded-full"
          :class="dotClass(d) || 'bg-transparent'"
        ></span>
      </button>
    </div>
  </div>
</template>
