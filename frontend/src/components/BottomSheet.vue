<script setup>
// Native modal bottom sheet (HIG sheets.md / Material bottom sheet).
// - drag down from the grabber, the header, or content scrolled to the top
// - dismisses on distance or a downward flick; otherwise springs back
// - the backdrop fades with the drag
// - back gesture / Android back / Esc / backdrop tap / Cancel all close it,
//   via one history entry, so "back closes one layer"
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'
import { velocityTracker, rubberBand } from '../lib/gestures.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closeLabel: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const panel = ref(null)
const body = ref(null)
const dragY = ref(0)
const dragging = ref(false)
const tracker = velocityTracker()
let startY = 0
let startedInBody = false
let pushedHistoryState = false
let lastFocus = null

function close(fromPopstate = false) {
  haptics.tap()
  dragY.value = 0
  if (pushedHistoryState && !fromPopstate) {
    pushedHistoryState = false
    window.history.back()
  }
  pushedHistoryState = false
  emit('close')
}

function onPopstate() {
  if (props.open && pushedHistoryState) {
    pushedHistoryState = false
    close(true)
  }
}

function onTouchStart(e, fromBody) {
  if (e.touches.length !== 1) return
  // Content only drags the sheet when it is scrolled to the very top
  if (fromBody && body.value && body.value.scrollTop > 0) return
  startedInBody = fromBody
  startY = e.touches[0].clientY
  tracker.reset()
  tracker.add(0, startY)
  dragging.value = true
}

function onTouchMove(e) {
  if (!dragging.value) return
  const y = e.touches[0].clientY
  tracker.add(0, y)
  const dy = y - startY
  // Scrolling up inside content is just scrolling
  if (startedInBody && dy < 0) {
    dragging.value = false
    dragY.value = 0
    return
  }
  dragY.value = dy > 0 ? dy : rubberBand(dy, 400, 0.3)
}

function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false
  const height = panel.value?.offsetHeight || 400
  const { y: vy } = tracker.velocity()
  if (dragY.value > height * 0.3 || (vy > 0.55 && dragY.value > 12)) {
    close()
  } else {
    dragY.value = 0
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.open) close()
}

const backdropOpacity = computed(() => {
  const height = panel.value?.offsetHeight || 400
  return Math.max(0, 1 - Math.max(0, dragY.value) / height)
})

watch(
  () => props.open,
  async (val) => {
    dragY.value = 0
    document.documentElement.classList.toggle('sheet-open', val)
    if (val && !pushedHistoryState) {
      window.history.pushState({ ...(window.history.state || {}), _sheetOpen: true }, '')
      pushedHistoryState = true
    } else if (!val) {
      pushedHistoryState = false
    }
    // Move focus into the sheet, and back to the opener when it closes
    if (val) {
      lastFocus = document.activeElement
      await nextTick()
      panel.value?.focus({ preventScroll: true })
    } else {
      lastFocus?.focus?.({ preventScroll: true })
      lastFocus = null
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('popstate', onPopstate)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('popstate', onPopstate)
  document.documentElement.classList.remove('sheet-open')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-layer" role="dialog" aria-modal="true" :aria-label="title">
        <div class="sheet-backdrop" :style="{ opacity: backdropOpacity }" @click="close()"></div>

        <div
          ref="panel"
          class="sheet-panel"
          tabindex="-1"
          :style="{
            transform: dragY ? `translate3d(0, ${dragY}px, 0)` : undefined,
            transition: dragging ? 'none' : undefined,
          }"
        >
          <div
            class="sheet-header"
            @touchstart.passive="onTouchStart($event, false)"
            @touchmove.passive="onTouchMove"
            @touchend.passive="onTouchEnd"
            @touchcancel.passive="onTouchEnd"
          >
            <div class="sheet-grabber" aria-hidden="true"></div>
            <div class="flex items-center justify-between min-h-[44px] gap-2">
              <button type="button" class="sheet-cancel" @click="close()">
                {{ closeLabel || t('nav.cancel') }}
              </button>
              <h2 class="text-[1.0625rem] font-semibold text-ink truncate text-center flex-1">{{ title }}</h2>
              <div class="min-w-[56px] flex justify-end">
                <slot name="action" />
              </div>
            </div>
          </div>

          <div
            ref="body"
            class="sheet-body"
            @touchstart.passive="onTouchStart($event, true)"
            @touchmove.passive="onTouchMove"
            @touchend.passive="onTouchEnd"
            @touchcancel.passive="onTouchEnd"
          >
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
