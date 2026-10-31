<script setup>
// iOS-style segmented control: a sliding thumb marks the selected segment.
// It claims horizontal touches (data-no-swipe) so tab swiping never fires on it.
import { computed } from 'vue'
import { haptics } from '../lib/haptics.js'

const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true }, // [{ value, label }]
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const index = computed(() => Math.max(0, props.options.findIndex((o) => o.value === props.modelValue)))

function select(option) {
  if (option.value === props.modelValue) return
  haptics.select()
  emit('update:modelValue', option.value)
}

function onKeydown(e) {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
  if (!step) return
  e.preventDefault()
  const rtl = document.documentElement.dir === 'rtl'
  const next = props.options[index.value + (rtl ? -step : step)]
  if (next) select(next)
}
</script>

<template>
  <div
    class="segmented"
    role="tablist"
    :aria-label="label || undefined"
    data-no-swipe
    :style="{ '--count': options.length, '--index': index }"
    @keydown="onKeydown"
  >
    <span class="segmented-thumb" aria-hidden="true"></span>
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="segmented-option"
      :class="{ 'is-selected': option.value === modelValue }"
      :aria-selected="option.value === modelValue"
      :tabindex="option.value === modelValue ? 0 : -1"
      @click="select(option)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--count), minmax(0, 1fr));
  padding: 3px;
  border-radius: 12px;
  background: rgb(var(--sunk));
}
.segmented-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  inset-inline-start: 3px;
  width: calc((100% - 6px) / var(--count));
  border-radius: 9px;
  background: rgb(var(--surface));
  box-shadow: 0 3px 8px rgba(10, 14, 28, 0.12), 0 0 0 0.5px rgba(10, 14, 28, 0.04);
  transform: translateX(calc(var(--index) * 100% * var(--dir-x)));
  transition: transform 340ms var(--ease-ios);
}
.segmented-option {
  position: relative;
  z-index: 1;
  min-height: 40px;
  padding: 0 0.5rem;
  border-radius: 9px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(var(--ink-soft));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 160ms ease;
}
.segmented-option.is-selected {
  font-weight: 600;
  color: rgb(var(--ink));
}
@media (prefers-reduced-motion: reduce) {
  .segmented-thumb { transition: none; }
}
</style>
