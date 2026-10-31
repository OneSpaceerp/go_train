<script setup>
// Navigation bar with iOS large-title behaviour: tab roots show a large title
// that collapses into the bar as you scroll; pushed screens get a compact title
// and a back button naming the previous screen (iOS) or an arrow (Android).
// The bar is transparent at the top and turns to glass once content scrolls
// beneath it (HIG scroll edge effect).
import { computed, ref, onMounted, onBeforeUnmount, onActivated, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'
import { titleForPath, tabByName, currentTab, setNextNavigation } from '../lib/nav.js'
import { isIosLike } from '../lib/platform.js'

const props = defineProps({
  title: String,
  subtitle: String,
  back: Boolean,
  large: Boolean,
  scrolled: Boolean,
})
const router = useRouter()

const largeTitle = ref(null)
const collapsed = ref(!props.large)
let observer = null

// The back label is the previous screen's title when it is short enough,
// otherwise "Back", as on iOS.
const backLabel = ref('')
function readBackLabel() {
  const previous = titleForPath(typeof window !== 'undefined' ? window.history.state?.back : '')
  backLabel.value = previous && previous.length <= 14 ? previous : t('nav.back')
}

function goBack() {
  haptics.tap()
  if (window.history.state?.back) {
    router.back()
  } else {
    // Opened directly (deep link / notification): pop to the tab's root
    setNextNavigation({ direction: 'backward' })
    router.replace(tabByName(currentTab.value)?.root || '/')
  }
}

function scrollToTop() {
  if (window.scrollY > 0) {
    haptics.select()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function observe() {
  if (!props.large || !largeTitle.value || typeof IntersectionObserver === 'undefined') return
  observer?.disconnect()
  // The large title counts as gone once it slides under the bar (whose
  // height includes the notch / Dynamic Island inset)
  const barHeight = largeTitle.value.previousElementSibling?.offsetHeight || 64
  observer = new IntersectionObserver(
    ([entry]) => {
      collapsed.value = !entry.isIntersecting
    },
    { rootMargin: `-${barHeight}px 0px 0px 0px`, threshold: 0 },
  )
  observer.observe(largeTitle.value)
}

onMounted(() => {
  readBackLabel()
  observe()
})
onActivated(observe)
onDeactivated(() => observer?.disconnect())
onBeforeUnmount(() => observer?.disconnect())

const showBarBackground = computed(() => props.scrolled || !props.large)
</script>

<template>
  <header
    class="appbar"
    :class="{ 'appbar--glass': showBarBackground, 'appbar--edge': scrolled }"
  >
    <div class="appbar-row">
      <div class="appbar-side">
        <button
          v-if="back"
          type="button"
          class="appbar-back"
          :aria-label="t('nav.back')"
          @click="goBack"
        >
          <Icon name="back" :size="isIosLike ? 26 : 22" />
          <span v-if="isIosLike" class="appbar-back-label">{{ backLabel }}</span>
        </button>
      </div>

      <div
        class="appbar-title"
        :class="{ 'is-visible': collapsed }"
        :aria-hidden="large ? 'true' : undefined"
        @click="scrollToTop"
      >
        <component
          :is="large ? 'p' : 'h1'"
          class="appbar-title-text"
          :data-screen-title="large ? undefined : ''"
          :tabindex="large ? undefined : -1"
        >
          {{ title }}
        </component>
        <p v-if="subtitle && !large" class="appbar-subtitle">{{ subtitle }}</p>
      </div>

      <div class="appbar-side appbar-side--end">
        <slot name="actions" />
      </div>
    </div>
  </header>

  <div v-if="large" ref="largeTitle" class="large-title">
    <h1 class="large-title-text" data-screen-title tabindex="-1">{{ title }}</h1>
    <p v-if="subtitle" class="large-title-subtitle">{{ subtitle }}</p>
  </div>
</template>
