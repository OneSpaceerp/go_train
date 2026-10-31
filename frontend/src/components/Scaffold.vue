<script setup>
// Native screen shell: navigation bar (large title on tab roots), status
// banners, pull-to-refresh, and the screen-level gestures:
//   • edge-swipe back on pushed screens — the screen follows the finger and
//     commits on distance or a flick, like a UINavigationController pop
//   • swipe between tabs on tab roots — a supplementary shortcut to the tab
//     bar; it never starts at the screen edges, in horizontal scrollers or in
//     form fields
// `touch-action: pan-y pinch-zoom` keeps vertical scrolling and pinch-zoom on
// the compositor while horizontal swipes are handled here. Once a swipe locks
// to the horizontal axis (before the browser's scroll slop), its touchmoves
// are cancelled so the page can't drift or fling vertically underneath it.
import { ref, computed, watch, onMounted, onUnmounted, onDeactivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from './AppHeader.vue'
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
import { registerTitle, adjacentTab, goTab, setNextNavigation, tabByName, currentTab } from '../lib/nav.js'
import { velocityTracker, horizontalGestureClaimed, rubberBand } from '../lib/gestures.js'

const props = defineProps({
  title: String,
  subtitle: String,
  back: Boolean,
  // Tab root: large title + swipe between tabs
  tab: Boolean,
  onRefresh: Function,
})

const route = useRoute()
const router = useRouter()
const root = ref(null)
const scrolled = ref(false)

// --- title bookkeeping (back-button labels, window title) -------------------
watch(
  () => props.title,
  (title) => {
    registerTitle(route.fullPath, title)
    if (title && typeof document !== 'undefined') document.title = `${title} · Go Train`
  },
  { immediate: true },
)

function onScroll() {
  scrolled.value = window.scrollY > 4
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  // Non-passive so an owned horizontal swipe can stop vertical scrolling
  root.value?.addEventListener('touchmove', onTouchMove, { passive: false })
  onScroll()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  root.value?.removeEventListener('touchmove', onTouchMove)
})

// --- gesture state ----------------------------------------------------------
const EDGE = 24 // px from the leading edge that starts a back swipe
const offsetX = ref(0) // horizontal displacement of the screen
const animating = ref(false) // spring-back / commit in progress
const mode = ref(null) // 'back' | 'pager' | 'pull' | null
const pullDistance = ref(0)
const refreshing = ref(false)
const PULL_TRIGGER = 64

const tracker = velocityTracker()
let start = null // { x, y, target }
let axis = null // 'x' | 'y' | null
let pullArmed = false

const width = () => window.innerWidth || 375
// +1 when the finger moves toward the trailing edge (right in LTR, left in RTL)
const lead = () => (isRtl.value ? -1 : 1)

function resetGesture() {
  start = null
  axis = null
  mode.value = null
}

function onTouchStart(e) {
  if (e.touches.length !== 1 || animating.value || refreshing.value) return resetGesture()
  const touch = e.touches[0]
  start = { x: touch.clientX, y: touch.clientY, target: e.target }
  axis = null
  pullArmed = false
  tracker.reset()
  tracker.add(touch.clientX, touch.clientY)
}

function onTouchMove(e) {
  if (!start || e.touches.length !== 1) return
  if ((mode.value === 'back' || mode.value === 'pager') && e.cancelable) e.preventDefault()
  const touch = e.touches[0]
  tracker.add(touch.clientX, touch.clientY)
  const dx = touch.clientX - start.x
  const dy = touch.clientY - start.y

  if (!axis) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y'
    const fromLeadingEdge = isRtl.value ? width() - start.x <= EDGE : start.x <= EDGE
    const fromAnyEdge = start.x <= EDGE || width() - start.x <= EDGE

    if (axis === 'x' && props.back && fromLeadingEdge && dx * lead() > 0) {
      mode.value = 'back'
      if (e.cancelable) e.preventDefault()
    } else if (axis === 'x' && props.tab && !fromAnyEdge && !horizontalGestureClaimed(start.target, root.value)) {
      mode.value = 'pager'
      if (e.cancelable) e.preventDefault()
    } else if (axis === 'y' && props.onRefresh && dy > 0 && window.scrollY <= 0) {
      mode.value = 'pull'
    } else {
      mode.value = null
    }
  }

  if (mode.value === 'back') {
    offsetX.value = lead() * Math.max(0, Math.min(width(), dx * lead()))
  } else if (mode.value === 'pager') {
    // Rubber-band when there is no tab in that direction
    const target = pagerTarget(dx)
    offsetX.value = target ? dx : rubberBand(dx, width(), 0.35)
  } else if (mode.value === 'pull') {
    if (window.scrollY > 0) return
    const next = Math.min(110, rubberBand(Math.max(0, dy), 320, 0.55))
    if (next >= PULL_TRIGGER && !pullArmed) {
      pullArmed = true
      haptics.select()
    } else if (next < PULL_TRIGGER) {
      pullArmed = false
    }
    pullDistance.value = next
  }
}

// The tab a horizontal swipe would reveal: swiping toward the leading edge
// shows the next tab in reading order.
function pagerTarget(dx) {
  const step = dx * lead() < 0 ? 1 : -1
  return adjacentTab(step)
}

function settle(to, then) {
  animating.value = true
  offsetX.value = to
  setTimeout(() => {
    animating.value = false
    then?.()
  }, 260)
}

function onTouchEnd() {
  if (!start) return
  const { x: vx } = tracker.velocity()
  const w = width()
  const current = mode.value

  if (current === 'back') {
    const progress = (offsetX.value * lead()) / w
    const flick = vx * lead() > 0.45
    if ((progress > 0.33 || flick) && progress > 0.06) {
      haptics.tap()
      settle(lead() * w, popScreen)
    } else {
      settle(0)
    }
  } else if (current === 'pager') {
    const dx = offsetX.value
    const target = pagerTarget(dx)
    const flick = Math.abs(vx) > 0.4 && Math.sign(vx) === Math.sign(dx)
    if (target && (Math.abs(dx) > w * 0.28 || flick)) {
      haptics.select()
      // The outgoing screen keeps its offset; the transition carries it off
      goTab(router, target.tab, { direction: dx < 0 ? 'swipe-left' : 'swipe-right' })
    } else {
      settle(0)
    }
  } else if (current === 'pull') {
    finishPull()
  }
  resetGesture()
}

function popScreen() {
  setNextNavigation({ direction: 'swipe-back' })
  if (window.history.state?.back) router.back()
  else router.replace(tabByName(currentTab.value)?.root || '/')
}

async function finishPull() {
  if (pullDistance.value < PULL_TRIGGER || refreshing.value) {
    pullDistance.value = 0
    return
  }
  refreshing.value = true
  pullDistance.value = 52
  haptics.medium()
  try {
    if (typeof props.onRefresh === 'function') await props.onRefresh()
  } catch {
    haptics.error()
  } finally {
    refreshing.value = false
    pullDistance.value = 0
  }
}

// A screen kept alive in a tab must come back unshifted
onDeactivated(() => {
  offsetX.value = 0
  animating.value = false
  pullDistance.value = 0
  resetGesture()
})

const screenStyle = computed(() => {
  if (!offsetX.value && !animating.value) return undefined
  const tracking = mode.value && !animating.value
  return {
    transform: `translate3d(${offsetX.value}px, 0, 0)`,
    transition: tracking ? 'none' : 'transform 260ms var(--ease-ios)',
  }
})

// Dim the area the screen uncovers during a back swipe
const underlayOpacity = computed(() =>
  mode.value === 'back' || (animating.value && props.back) ? 0.12 * (1 - Math.abs(offsetX.value) / width()) : 0,
)
</script>

<template>
  <div
    v-if="underlayOpacity > 0"
    class="fixed inset-0 z-0 bg-black pointer-events-none"
    :style="{ opacity: underlayOpacity }"
    aria-hidden="true"
  ></div>

  <div
    ref="root"
    class="screen"
    :class="{ 'screen--moving': offsetX !== 0 }"
    :style="screenStyle"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
    @touchcancel.passive="onTouchEnd"
  >
    <AppHeader
      v-if="title"
      :title="title"
      :subtitle="subtitle"
      :back="back"
      :large="tab"
      :scrolled="scrolled"
    >
      <template #actions><slot name="actions" /></template>
    </AppHeader>

    <!-- Pull-to-refresh: the indicator follows the finger, then spins -->
    <div
      class="ptr"
      :style="{ height: `${pullDistance}px`, transition: mode === 'pull' ? 'none' : undefined }"
      aria-hidden="true"
    >
      <div
        class="ptr-spinner"
        :class="{ 'is-armed': pullDistance >= PULL_TRIGGER, 'animate-spin': refreshing }"
        :style="!refreshing ? { transform: `rotate(${pullDistance * 3.2}deg) scale(${Math.min(1, pullDistance / 52)})` } : undefined"
      >
        <Icon name="refresh" :size="16" />
      </div>
    </div>
    <p v-if="refreshing" class="sr-only" role="status">{{ t('pwa.refreshing') }}</p>

    <!-- Status banners -->
    <div v-if="swUpdateAvailable || !isOnline || pendingSyncCount > 0 || syncFailures.length" class="screen-banners">
      <button v-if="swUpdateAvailable" type="button" class="banner banner--brand pressable" @click="applySwUpdate()">
        <span class="flex items-center gap-2"><Icon name="sparkles" :size="15" /> {{ t('pwa.updateReady') }}</span>
        <span class="banner-action">{{ t('pwa.reload') }}</span>
      </button>

      <div v-if="!isOnline || pendingSyncCount > 0" class="banner" :class="!isOnline ? 'banner--warn' : 'banner--ok'" role="status">
        <span class="flex items-center gap-2">
          <Icon :name="!isOnline ? 'wifiOff' : 'refresh'" :size="15" />
          {{ !isOnline ? t('pwa.offline') : `${t('pwa.queued')} (${pendingSyncCount})` }}
        </span>
      </div>

      <div v-if="syncFailures.length" class="banner banner--bad" role="alert">
        <span class="min-w-0">
          {{ t('pwa.syncFailed') }} ({{ syncFailures.length }})
          <span class="block text-ink-soft font-normal truncate">{{ syncFailures[syncFailures.length - 1].lastError }}</span>
        </span>
        <button type="button" class="banner-action" @click="dismissSyncFailures">{{ t('pwa.dismiss') }}</button>
      </div>
    </div>

    <main class="screen-main">
      <slot />
    </main>
  </div>
</template>
