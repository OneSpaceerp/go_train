<script setup>
// Floating Liquid Glass tab bar (iOS 26 style; a navigation rail at ≥ 840px).
// Tabs navigate between sections and keep each section's stack (lib/nav.js):
// tap another tab → its last screen; tap the active tab → pop to its root,
// then scroll to top. A lens slides to the selected tab.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { tabs, currentTab, goTab } from '../lib/nav.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const router = useRouter()
const activeIndex = computed(() => Math.max(0, tabs.value.findIndex((item) => item.tab === currentTab.value)))

// Re-trigger the icon "squish" each time a tab becomes active
const bounce = ref(0)
watch(currentTab, () => bounce.value++)

function onTab(item) {
  const result = goTab(router, item.tab)
  if (result === 'switch' || result === 'pop-to-root') haptics.select()
}

// Warm the destination's code chunk on touch-down so the switch is instant
function prefetch(item) {
  for (const match of router.resolve(item.root).matched) {
    const loader = match.components?.default
    // A failed prefetch is harmless: the navigation itself recovers (router.js)
    if (typeof loader === 'function') loader()?.catch?.(() => {})
  }
}
</script>

<template>
  <nav class="tabbar bottom-nav-dock" :aria-label="t('nav.primary')">
    <div class="tabbar-capsule glass-dock" :style="{ '--tabs': tabs.length, '--active': activeIndex }">
      <span class="tabbar-lens" aria-hidden="true"></span>
      <a
        v-for="item in tabs"
        :key="item.tab"
        :href="`/gotrain${item.root === '/' ? '' : item.root}`"
        class="tabbar-item"
        :class="{ 'is-active': item.tab === currentTab }"
        :aria-current="item.tab === currentTab ? 'page' : undefined"
        @pointerdown="prefetch(item)"
        @click.prevent="onTab(item)"
      >
        <span class="relative">
          <Icon
            :key="item.tab === currentTab ? `on-${bounce}` : 'off'"
            :name="item.icon"
            :size="24"
            :filled="item.tab === currentTab"
            :class="item.tab === currentTab ? 'tabbar-icon-pop' : ''"
          />
          <span
            v-if="item.badge > 0"
            class="tabbar-badge"
            :aria-label="t('nav.unread', { n: item.badge })"
          >
            {{ item.badge > 9 ? '9+' : item.badge }}
          </span>
        </span>
        <span class="tabbar-label">{{ item.label }}</span>
      </a>
    </div>
  </nav>
</template>
