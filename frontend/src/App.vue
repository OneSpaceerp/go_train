<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import BottomNav from './components/BottomNav.vue'
import { session } from './lib/session.js'

// Tab roots stay mounted while you move around, like native tab controllers:
// coming back to a tab is instant and keeps its scroll, inputs and data.
// Screens refresh themselves on return (see lib/useScreen.js).
const KEEP_ALIVE = ['Train', 'Classes', 'Track', 'Messages', 'Profile', 'CoachClients', 'CoachPrograms']

const route = useRoute()

// One persistent tab bar for the whole app (it stays still during screen
// transitions), hidden on sign-in and on focused flows such as a chat.
const showTabBar = computed(() => Boolean(session.user) && route.matched.length > 0 && !route.meta.hideTabBar)

watchEffect(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('has-tabbar', showTabBar.value)
  }
})
</script>

<template>
  <RouterView v-slot="{ Component, route: current }">
    <KeepAlive :include="KEEP_ALIVE" :max="8">
      <component :is="Component" :key="current.fullPath" />
    </KeepAlive>
  </RouterView>
  <BottomNav v-if="showTabBar" />
</template>
