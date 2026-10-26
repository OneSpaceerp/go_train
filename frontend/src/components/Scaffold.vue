<script setup>
// Native app shell wrapper: scroll-aware Liquid Glass header, pull-to-refresh,
// iOS edge-swipe back gesture on detail views, offline status bar, and safe-area
// bottom navigation room.
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from './AppHeader.vue'
import BottomNav from './BottomNav.vue'
import Icon from './Icon.vue'
import { isOnline, pendingSyncCount } from '../lib/pwa.js'
import { haptics } from '../lib/haptics.js'
import { t, isRtl } from '../lib/i18n.js'

const props = defineProps({
  title: String,
  subtitle: String,
  back: Boolean,
  tab: Boolean,
  onRefresh: Function,
})

const router = useRouter()
const scrolled = ref(false)
const pullDistance = ref(0)
const refreshing = ref(false)

let touchStartY = 0
let touchStartX = 0
let pulling = false
let edgeSwipe = false

function onScroll() {
  scrolled.value = window.scrollY > 6
}

function onTouchStart(e) {
  if (!e.touches || e.touches.length !== 1) return
  const touch = e.touches[0]
  touchStartY = touch.clientY
  touchStartX = touch.clientX
  pulling = window.scrollY <= 0
  // Edge swipe back from leading 24px margin on detail views
  const fromLeadingEdge = isRtl.value
    ? window.innerWidth - touch.clientX < 26
    : touch.clientX < 26
  edgeSwipe = Boolean(props.back && fromLeadingEdge)
}

function onTouchMove(e) {
  if (!e.touches || e.touches.length !== 1) return
  const dy = e.touches[0].clientY - touchStartY
  const dx = e.touches[0].clientX - touchStartX

  if (pulling && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.4 && window.scrollY <= 0) {
    pullDistance.value = Math.min(84, dy * 0.42)
  } else if (dy < 0) {
    pullDistance.value = 0
  }
}

async function onTouchEnd(e) {
  if (edgeSwipe && e.changedTouches?.length) {
    const dx = e.changedTouches[0].clientX - touchStartX
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY)
    const triggered = isRtl.value ? dx < -85 : dx > 85
    if (triggered && dy < 48) {
      haptics.tap()
      if (window.history.length > 1) router.back()
      else router.replace('/')
      pullDistance.value = 0
      edgeSwipe = false
      return
    }
  }
  edgeSwipe = false

  if (pullDistance.value >= 56 && !refreshing.value) {
    refreshing.value = true
    pullDistance.value = 48
    haptics.medium()
    try {
      if (typeof props.onRefresh === 'function') {
        await props.onRefresh()
      } else {
        window.dispatchEvent(new CustomEvent('gotrain:refresh'))
        await new Promise((r) => setTimeout(r, 420))
      }
    } finally {
      refreshing.value = false
      pullDistance.value = 0
    }
  } else {
    pullDistance.value = 0
  }
  pulling = false
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div
    class="min-h-full flex flex-col"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <AppHeader
      v-if="title"
      :title="title"
      :subtitle="subtitle"
      :back="back"
      :scrolled="scrolled"
    >
      <template #actions><slot name="actions" /></template>
    </AppHeader>

    <!-- Offline / Queued Sync Status Banner -->
    <div
      v-if="!isOnline || pendingSyncCount > 0"
      class="mx-auto w-full max-w-[36rem] px-4 pt-2"
    >
      <div
        class="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border"
        :class="
          !isOnline
            ? 'bg-warn/10 text-warn border-warn/25'
            : 'bg-ok/10 text-ok border-ok/25'
        "
      >
        <span class="flex items-center gap-2">
          <Icon :name="!isOnline ? 'wifiOff' : 'refresh'" :size="15" />
          {{ !isOnline ? t('pwa.offline') : `${t('pwa.queued')} (${pendingSyncCount})` }}
        </span>
      </div>
    </div>

    <!-- Pull-to-refresh spinner indicator -->
    <div
      class="mx-auto w-full max-w-[36rem] flex justify-center overflow-hidden transition-all duration-150"
      :style="{ height: pullDistance ? `${pullDistance}px` : '0px' }"
      aria-hidden="true"
    >
      <div class="flex items-center justify-center">
        <div
          class="w-8 h-8 rounded-full bg-surface shadow-card border border-line grid place-items-center text-brand-600"
          :class="refreshing ? 'animate-spin' : ''"
          :style="{
            transform: !refreshing ? `rotate(${pullDistance * 4}deg) scale(${Math.min(1, pullDistance / 48)})` : undefined,
          }"
        >
          <Icon name="refresh" :size="16" />
        </div>
      </div>
    </div>

    <main
      class="flex-1 mx-auto w-full max-w-[36rem] px-4"
      :class="tab ? 'pb-[calc(6.75rem+env(safe-area-inset-bottom))]' : 'pb-[calc(2.5rem+env(safe-area-inset-bottom))]'"
    >
      <slot />
    </main>

    <BottomNav v-if="tab" />
  </div>
</template>
