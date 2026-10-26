<script setup>
// Native iOS-style modal bottom sheet (Apple HIG sheets.md).
// Supports swipe-down-to-dismiss on the grabber/header, Escape key, backdrop tap,
// and keyboard-safe scrollable content.
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closeLabel: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const dragY = ref(0)
const dragging = ref(false)
let startY = 0

function close() {
  haptics.tap()
  dragY.value = 0
  emit('close')
}

function onTouchStart(e) {
  if (!e.touches?.length) return
  startY = e.touches[0].clientY
  dragging.value = true
}

function onTouchMove(e) {
  if (!dragging.value || !e.touches?.length) return
  const dy = e.touches[0].clientY - startY
  dragY.value = dy > 0 ? dy : dy * 0.15
}

function onTouchEnd() {
  if (!dragging.value) return
  dragging.value = false
  if (dragY.value > 95) {
    close()
  } else {
    dragY.value = 0
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.open) close()
}

watch(
  () => props.open,
  (val) => {
    dragY.value = 0
    if (typeof document !== 'undefined') {
      document.body.style.overflow = val ? 'hidden' : ''
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          @click="close"
        ></div>

        <div
          class="sheet-panel relative w-full max-w-[36rem] max-h-[88dvh] flex flex-col bg-surface rounded-t-sheet shadow-2xl border-t border-line/70 overflow-hidden"
          :style="{
            transform: dragY ? `translateY(${Math.max(0, dragY)}px)` : undefined,
            transition: dragging ? 'none' : undefined,
            paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
          }"
        >
          <!-- Grabber + Header (Swipeable) -->
          <div
            class="pt-2.5 pb-2 px-4 select-none cursor-grab active:cursor-grabbing border-b border-line/60"
            @touchstart.passive="onTouchStart"
            @touchmove.passive="onTouchMove"
            @touchend="onTouchEnd"
          >
            <div class="mx-auto w-10 h-1.5 rounded-full bg-ink-mute/30 mb-2.5"></div>
            <div class="flex items-center justify-between min-h-[44px] gap-2">
              <button
                type="button"
                class="min-h-[44px] px-2 text-[0.9375rem] font-medium text-brand-600 active:opacity-70"
                @click="close"
              >
                {{ closeLabel || t('nav.cancel') }}
              </button>
              <h2 class="text-[1.0625rem] font-semibold text-ink truncate text-center flex-1">
                {{ title }}
              </h2>
              <div class="min-w-[56px] flex justify-end">
                <slot name="action" />
              </div>
            </div>
          </div>

          <!-- Scrollable Sheet Content -->
          <div class="flex-1 overflow-y-auto px-5 pt-4 pb-2 overscroll-contain">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
