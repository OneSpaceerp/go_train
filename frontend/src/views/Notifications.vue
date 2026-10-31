<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'
import { fromNow } from '../lib/format.js'
import { unreadNotifications } from '../lib/pwa.js'
import {
  notificationSupported,
  notificationPermission,
  requestNotificationPermission,
} from '../lib/permissions.js'

const items = ref([])
const loading = ref(true)
const ICON = { workout: 'dumbbell', message: 'message', promo: 'tag', system: 'bell' }

async function load() {
  loading.value = true
  try {
    items.value = await api.get('/notifications')
    unreadNotifications.value = 0
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {})
    }
    api.post('/notifications/read').catch(() => {})
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <Scaffold title="Notifications" back :onRefresh="load">
    <!-- Native OS Push Permission Prompt Banner -->
    <div
      v-if="notificationSupported && notificationPermission === 'default'"
      class="card p-4 mt-3 flex items-center justify-between gap-3 border-accent/30"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-accent/30 text-accent-ink grid place-items-center shrink-0">
          <Icon name="bell" :size="18" />
        </div>
        <div class="min-w-0">
          <p class="font-bold text-sm text-ink">Enable Device Notifications</p>
          <p class="text-xs text-ink-soft">
            Receive instant coach alerts &amp; rest timer chimes
          </p>
        </div>
      </div>
      <button
        type="button"
        class="btn-primary !min-h-[44px] !px-3.5 text-sm shrink-0"
        @click="requestNotificationPermission()"
      >
        Allow
      </button>
    </div>

    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 3" :key="i" class="card p-4 h-16 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!items.length" icon="bell" title="You're all caught up" />
    <div v-else class="pt-4 space-y-2">
      <div v-for="n in items" :key="n.id" class="card p-4 flex gap-3" :class="n.read_at ? '' : 'ring-1 ring-accent'">
        <div class="w-10 h-10 rounded-xl bg-accent-soft text-accent-ink grid place-items-center shrink-0"><Icon :name="ICON[n.kind] || 'bell'" :size="18" /></div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold">{{ n.title }}</p>
          <p class="text-sm text-ink-soft" dir="auto">{{ n.body }}</p>
          <p class="text-xs text-ink-mute mt-1">{{ fromNow(n.created_at) }}</p>
        </div>
      </div>
    </div>
  </Scaffold>
</template>
