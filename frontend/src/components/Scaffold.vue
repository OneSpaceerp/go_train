<script setup>
// Page wrapper: optional header, scrolling content with safe-area + tab-bar room,
// and the bottom nav when `tab` is set. Keeps every screen consistent.
import AppHeader from './AppHeader.vue'
import BottomNav from './BottomNav.vue'
defineProps({ title: String, back: Boolean, tab: Boolean })
</script>
<template>
  <div class="min-h-full flex flex-col">
    <AppHeader v-if="title" :title="title" :back="back">
      <template #actions><slot name="actions" /></template>
    </AppHeader>
    <main class="flex-1 mx-auto w-full max-w-[36rem] px-4"
          :class="tab ? 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]' : 'pb-8'">
      <slot />
    </main>
    <BottomNav v-if="tab" />
  </div>
</template>
