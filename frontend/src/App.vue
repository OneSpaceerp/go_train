<script setup>
import { computed } from 'vue'
import { navDirection } from './router.js'

// Directional page transitions:
// - Tab switches crossfade smoothly
// - Pushing deeper slides forward (incoming from right)
// - Navigating back slides backward (outgoing to right)
const transition = computed(() => {
  if (navDirection.value === 'tab') return 'fade'
  if (navDirection.value === 'backward') return 'slide-back'
  return 'slide-forward'
})
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Transition :name="transition" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>
</template>
