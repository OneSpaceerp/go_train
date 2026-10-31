<script setup>
// Native app shell wrapper: scroll-aware Liquid Glass header, pull-to-refresh,
// iOS edge-swipe back gesture on detail views, offline status bar, and safe-area
// bottom navigation room.
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from './AppHeader.vue'
import BottomNav from './BottomNav.vue'
import Icon from './Icon.vue'
import {
  isOnline,
  pendingSyncCount,
  syncFailures,
  dismissSyncFailures,
  swUpdateAvailable,
  applySwUpdate,
} from '../lib/pwa.js'
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
const edgeSwipeDx = ref(0)
const isEdgeSwiping = ref(false)

let touchStartY = 0
let touchStartX = 0
let pulling = false
let edgeSwipe = false
let pullThresholdCrossed = false

function onScroll() {
  scrolled.value = window.scrollY > 6
}

function onTouchStart(e) {
  if (!e.touches || e.touches.length !== 1) return
  const touch = e.touches[0]
  touchStartY = touch.clientY
  touchStartX = touch.clientX
  pulling = window.scrollY <= 0
  pullThresholdCrossed = false
  // Interactive finger-tracking edge swipe back from leading 26px margin on detail views
  const fromLeadingEdge = isRtl.value
    ? window.innerWidth - touch.clientX < 28
    : touch.clientX < 28
  edgeSwipe = Boolean(props.back && fromLeadingEdge)
  isEdgeSwiping.value = false
  edgeSwipeDx.value = 0
}

function onTouchMove(e) {
  if (!e.touches || e.touches.length !== 1) return
  const dy = e.touches[0].clientY - touchStartY
  const dx = e.touches[0].clientX - touchStartX

  if (edgeSwipe) {
    const directionalDx = isRtl.value ? -dx : dx
    if (directionalDx > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      isEdgeSwiping.value = true
      edgeSwipeDx.value = isRtl.value
        ? -Math.min(window.innerWidth * 0.75, directionalDx)
        : Math.min(window.innerWidth * 0.75, directionalDx)
      pullDistance.value = 0
      return
    }
  }

  if (pulling && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.4 && window.scrollY <= 0) {
    const nextPull = Math.min(84, dy * 0.42)
    if (nextPull >= 56 && !pullThresholdCrossed) {
      pullThresholdCrossed = true
      haptics.select()
    } else if (nextPull < 56 && pullThresholdCrossed) {
      pullThresholdCrossed = false
    }
    pullDistance.value = nextPull
  } else if (dy < 0) {
    pullDistance.value = 0
  }
}

async function onTouchEnd(e) {
  if (edgeSwipe && e.changedTouches?.length) {
    const dx = e.changedTouches[0].clientX - touchStartX
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY)
    const triggered = isRtl.value ? dx < -76 : dx > 76
    isEdgeSwiping.value = false
    edgeSwipeDx.value = 0
    if (triggered && dy < 60) {
      haptics.tap()
      if (window.history.length > 1) router.back()
      else router.replace('/')
      pullDistance.value = 0
      edgeSwipe = false
      return
    }
  }
  isEdgeSwiping.value = false
  edgeSwipeDx.value = 0
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
    class="min-h-dvh bg-surface-page text-ink flex flex-col"
    :style="{
      transform: edgeSwipeDx ? `translateX(${edgeSwipeDx}px)` : undefined,
      transition: isEdgeSwiping ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      boxShadow: edgeSwipeDx ? '-12px 0 32px rgba(0,0,0,0.22)' : undefined,
    }"
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

    <!-- Controlled Service Worker Update Banner (PWABuilder / professional-pwa-builder) -->
    <div
      v-if="swUpdateAvailable"
      class="mx-auto w-full max-w-[36rem] px-4 pt-2"
    >
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-brand-650 text-white shadow-card active:scale-[0.99] transition"
        @click="haptics.medium(); applySwUpdate()"
      >
        <span class="flex items-center gap-2">
          <Icon name="spark" :size="15" />
          New Go Train update ready
        </span>
        <span class="px-2.5 py-1 rounded-full bg-white/20 text-[0.6875rem] font-bold">
          Tap to reload
        </span>
      </button>
    </div>

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

    <!-- Offline changes the server rejected -->
    <div v-if="syncFailures.length" class="mx-auto w-full max-w-[36rem] px-4 pt-2">
      <div
        class="flex items-start justify-between gap-3 px-3.5 py-2 rounded-xl text-xs font-medium border bg-bad/10 text-bad border-bad/25"
        role="alert"
      >
        <span class="min-w-0">
          {{ t('pwa.syncFailed') }} ({{ syncFailures.length }})
          <span class="block text-ink-soft font-normal truncate">{{ syncFailures[syncFailures.length - 1].lastError }}</span>
        </span>
        <button type="button" class="shrink-0 font-bold underline" @click="dismissSyncFailures">
          {{ t('pwa.dismiss') }}
        </button>
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
