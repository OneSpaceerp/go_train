<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import { isCoach } from '../lib/session.js'

const route = useRoute()
const tabs = computed(() =>
  isCoach()
    ? [
        { to: '/coach', tab: 'clients', label: 'Clients', icon: 'clients' },
        { to: '/coach/programs', tab: 'programs', label: 'Programs', icon: 'programs' },
        { to: '/messages', tab: 'messages', label: 'Messages', icon: 'message' },
        { to: '/profile', tab: 'profile', label: 'Profile', icon: 'profile' },
      ]
    : [
        { to: '/', tab: 'train', label: 'Train', icon: 'train' },
        { to: '/track', tab: 'track', label: 'Track', icon: 'track' },
        { to: '/messages', tab: 'messages', label: 'Messages', icon: 'message' },
        { to: '/profile', tab: 'profile', label: 'Profile', icon: 'profile' },
      ],
)
const active = (t) => route.meta.tab === t.tab
</script>

<template>
  <nav class="fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-line shadow-nav"
       style="padding-bottom: env(safe-area-inset-bottom);" aria-label="Tabs">
    <div class="mx-auto max-w-[36rem] grid grid-cols-4">
      <RouterLink v-for="t in tabs" :key="t.tab" :to="t.to"
        class="flex flex-col items-center gap-1 py-2.5 transition active:scale-95"
        :class="active(t) ? 'text-brand-600' : 'text-ink-soft'">
        <Icon :name="t.icon" :size="23" :style="active(t) ? 'fill: currentColor; stroke-width: 1.5' : ''" />
        <span class="text-[0.72rem]" :class="active(t) ? 'font-semibold text-ink' : ''">{{ t.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
