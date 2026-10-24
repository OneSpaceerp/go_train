<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'
import { fromNow } from '../lib/format.js'

const items = ref([])
const loading = ref(true)
const ICON = { workout: 'dumbbell', message: 'message', promo: 'tag', system: 'bell' }
onMounted(async () => {
  try {
    items.value = await api.get('/notifications')
    api.post('/notifications/read').catch(() => {})
  } finally { loading.value = false }
})
</script>

<template>
  <Scaffold title="Notifications" back>
    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 3" :key="i" class="card p-4 h-16 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!items.length" icon="bell" title="You're all caught up" />
    <div v-else class="pt-4 space-y-2">
      <div v-for="n in items" :key="n.id" class="card p-4 flex gap-3" :class="n.read_at ? '' : 'ring-1 ring-brand-100'">
        <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center shrink-0"><Icon :name="ICON[n.kind] || 'bell'" :size="18" /></div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold">{{ n.title }}</p>
          <p class="text-sm text-ink-soft" dir="auto">{{ n.body }}</p>
          <p class="text-xs text-ink-mute mt-1">{{ fromNow(n.created_at) }}</p>
        </div>
      </div>
    </div>
  </Scaffold>
</template>
