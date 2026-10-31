<script setup>
import { computed } from 'vue'
const props = defineProps({ status: String })
// Map status -> {label, color role}. Red is reserved for missed/failed only.
const MAP = {
  done: ['Done', 'ok'], missed: ['Missed', 'bad'], active: ['Active', 'brand'],
  paused: ['Paused', 'warn'], ended: ['Ended', 'mute'], pending: ['Pending', 'warn'],
  available: ['Available', 'mute'],
}
const info = computed(() => MAP[String(props.status || '').toLowerCase()] || [props.status, 'brand'])
const classes = computed(() => ({
  ok: 'text-ok border-ok/30 bg-ok/10',
  bad: 'text-bad border-bad/30 bg-bad/10',
  warn: 'text-warn border-warn/30 bg-warn/10',
  brand: 'text-accent-ink border-accent/60 bg-accent-soft',
  mute: 'text-ink-soft border-line bg-surface-sunk',
}[info.value[1]]))
</script>
<template>
  <span class="pill" :class="classes">
    <span class="w-1.5 h-1.5 rounded-full bg-current"></span>{{ info[0] }}
  </span>
</template>
