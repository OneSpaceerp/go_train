<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import { isCoach } from '../lib/session.js'
import { unreadNotifications } from '../lib/pwa.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const route = useRoute()
const tabs = computed(() =>
  isCoach()
    ? [
        { to: '/coach', tab: 'clients', label: t('tab.clients'), icon: 'clients' },
        { to: '/coach/programs', tab: 'programs', label: t('tab.programs'), icon: 'programs' },
        { to: '/messages', tab: 'messages', label: t('tab.messages'), icon: 'message' },
        { to: '/profile', tab: 'profile', label: t('tab.profile'), icon: 'profile', badge: unreadNotifications.value },
      ]
    : [
        { to: '/', tab: 'train', label: t('tab.train'), icon: 'train' },
        { to: '/classes', tab: 'classes', label: t('tab.classes'), icon: 'calendar' },
        { to: '/track', tab: 'track', label: t('tab.track'), icon: 'track' },
        { to: '/messages', tab: 'messages', label: t('tab.messages'), icon: 'message' },
        { to: '/profile', tab: 'profile', label: t('tab.profile'), icon: 'profile', badge: unreadNotifications.value },
      ],
)
const active = (item) => route.meta.tab === item.tab

function onTabClick(item) {
  haptics.select()
  if (active(item) && window.scrollY > 12) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
</script>

<template>
  <nav
    class="bottom-nav-dock fixed inset-x-0 bottom-0 z-30 pointer-events-none px-3 pt-1 transition-all duration-200"
    style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
    aria-label="Primary Navigation"
  >
    <div
      class="pointer-events-auto mx-auto max-w-[34rem] glass-dock rounded-[1.75rem] border px-1.5 py-1 grid"
      :class="tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'"
    >
      <RouterLink
        v-for="item in tabs"
        :key="item.tab"
        :to="item.to"
        class="relative flex flex-col items-center justify-center min-h-[50px] py-1 px-1 rounded-[1.35rem] transition duration-150 active:scale-95 select-none"
        :class="
          active(item)
            ? 'text-brand-600 bg-brand-500/10'
            : 'text-ink-soft hover:text-ink'
        "
        @click="onTabClick(item)"
      >
        <div class="relative">
          <Icon
            :name="item.icon"
            :size="22"
            :style="active(item) ? 'stroke-width: 2.35' : 'stroke-width: 1.9'"
          />
          <span
            v-if="item.badge > 0"
            class="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-bad text-white text-[0.625rem] font-bold grid place-items-center"
          >
            {{ item.badge > 9 ? '9+' : item.badge }}
          </span>
        </div>
        <span
          class="text-[0.6875rem] leading-tight mt-0.5 truncate max-w-full"
          :class="active(item) ? 'font-bold text-brand-600' : 'font-medium text-ink-soft'"
        >
          {{ item.label }}
        </span>
      </RouterLink>
    </div>
  </nav>
</template>
