<script setup>
// Row with swipe-to-delete (swipe toward the leading edge to reveal Delete).
// Always pair it with a non-gesture way to delete (HIG: gestures are shortcuts).
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { haptics } from '../lib/haptics.js'
import { isRtl, t } from '../lib/i18n.js'

defineProps({ deleteLabel: { type: String, default: '' } })
const emit = defineEmits(['delete'])

const REVEAL = 88
const el = ref(null)
const offset = ref(0) // 0 … REVEAL (distance revealed)
const dragging = ref(false)
let start = null
let horizontal = null
let base = 0

const sign = () => (isRtl.value ? 1 : -1) // content moves toward the leading edge

function onStart(e) {
  if (e.touches.length !== 1) return
  start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  horizontal = null
  base = offset.value
}

function onMove(e) {
  if (!start) return
  const dx = e.touches[0].clientX - start.x
  const dy = e.touches[0].clientY - start.y
  if (horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horizontal = Math.abs(dx) > Math.abs(dy)
  if (!horizontal) return
  if (e.cancelable) e.preventDefault()
  dragging.value = true
  offset.value = Math.max(0, Math.min(REVEAL * 1.3, base + dx * sign()))
}

function onEnd() {
  if (!start) return
  start = null
  if (!dragging.value) return
  dragging.value = false
  const open = offset.value > REVEAL / 2
  if (open && base === 0) haptics.select()
  offset.value = open ? REVEAL : 0
}

function close() {
  offset.value = 0
}

function remove() {
  haptics.warning()
  offset.value = 0
  emit('delete')
}

onMounted(() => el.value?.addEventListener('touchmove', onMove, { passive: false }))
onBeforeUnmount(() => el.value?.removeEventListener('touchmove', onMove))
defineExpose({ close })
</script>

<template>
  <div class="swipe-row" data-no-swipe>
    <button
      type="button"
      class="swipe-row-action"
      :style="{ opacity: Math.min(1, offset / 40) }"
      :tabindex="offset ? 0 : -1"
      :aria-hidden="offset ? undefined : 'true'"
      @click="remove"
    >
      {{ deleteLabel || t('nav.delete', 'Delete') }}
    </button>
    <div
      ref="el"
      class="swipe-row-content"
      :style="{
        transform: `translate3d(${offset * sign()}px, 0, 0)`,
        transition: dragging ? 'none' : 'transform 260ms var(--ease-ios)',
      }"
      @touchstart.passive="onStart"
      @touchend.passive="onEnd"
      @touchcancel.passive="onEnd"
      @click.capture="offset && ($event.stopPropagation(), $event.preventDefault(), close())"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.swipe-row {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
}
.swipe-row-action {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: 88px;
  display: grid;
  place-items: center;
  background: rgb(var(--bad));
  color: #fff;
  font-weight: 600;
  font-size: 0.9375rem;
}
.swipe-row-content {
  position: relative;
  background: inherit;
}
</style>
