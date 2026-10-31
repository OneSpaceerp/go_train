<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import EmptyState from '../components/EmptyState.vue'
import { onScreenReturn } from '../lib/useScreen.js'
import { api } from '../lib/api.js'
import { fromNow } from '../lib/format.js'

const threads = ref([])
const loading = ref(true)
async function load() {
  try { threads.value = await api.get('/threads') } finally { loading.value = false }
}
onMounted(load)
onScreenReturn(load)
</script>

<template>
  <Scaffold title="Messages" tab>
    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 3" :key="i" class="card p-4 h-16 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!threads.length" icon="message" title="No conversations yet"
      subtitle="Message your coach here. Workout-day notes stay on each training day." />
    <div v-else class="pt-4 card divide-y divide-line">
      <RouterLink v-for="t in threads" :key="t.id" :to="`/threads/${t.id}`" class="flex items-center gap-3 p-4 active:bg-surface-sunk">
        <Avatar :name="t.other_name" :size="46" />
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate">{{ t.other_name }}</p>
          <p class="text-sm text-ink-soft truncate" dir="auto">{{ t.last_message || 'No messages yet' }}</p>
        </div>
        <span class="text-xs text-ink-mute shrink-0">{{ fromNow(t.last_at) }}</span>
      </RouterLink>
    </div>
  </Scaffold>
</template>
