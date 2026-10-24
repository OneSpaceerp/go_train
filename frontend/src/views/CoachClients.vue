<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'
import { session } from '../lib/session.js'

const clients = ref([])
const loading = ref(true)
onMounted(async () => {
  try { clients.value = await api.get('/coach/clients') } finally { loading.value = false }
})
</script>

<template>
  <Scaffold tab>
    <div class="flex items-center gap-3 pt-5 pb-4">
      <Avatar :name="session.user?.full_name" :url="session.user?.avatar_url" />
      <div class="flex-1 min-w-0"><p class="text-xs text-ink-soft">Coach</p>
        <p class="font-semibold truncate">{{ session.user?.full_name }}</p></div>
      <RouterLink to="/messages" class="icon-btn bg-surface-sunk" aria-label="Messages"><Icon name="message" :size="20" /></RouterLink>
    </div>

    <p class="section-label mb-2 px-1">Your clients</p>
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="card p-4 h-16 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!clients.length" icon="clients" title="No clients yet" subtitle="Add athletes to start coaching." />
    <div v-else class="card divide-y divide-line">
      <div v-for="c in clients" :key="c.id" class="flex items-center gap-3 p-4">
        <Avatar :name="c.full_name" :size="44" />
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate">{{ c.full_name }}</p>
          <p class="text-xs text-ink-soft">{{ c.active_programs }} active program{{ c.active_programs === 1 ? '' : 's' }}</p>
        </div>
        <StatusPill :status="c.status" />
      </div>
    </div>
  </Scaffold>
</template>
