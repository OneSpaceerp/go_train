<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'

const promos = ref([])
const loading = ref(true)
onMounted(async () => {
  try { promos.value = await api.get('/promos') } finally { loading.value = false }
})
</script>

<template>
  <Scaffold title="Promos" back>
    <div v-if="loading" class="card p-4 h-24 animate-pulse bg-surface-sunk mt-4"></div>
    <EmptyState v-else-if="!promos.length" icon="tag" title="No promos right now" />
    <div v-else class="pt-4 space-y-3">
      <div v-for="p in promos" :key="p.id" class="card p-4 flex items-center gap-4">
        <div class="w-14 h-14 rounded-xl bg-accent text-accent-on grid place-items-center font-bold text-lg shrink-0">
          {{ p.percent_off }}%
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold">{{ p.title }}</p>
          <p class="text-sm text-ink-soft">{{ p.description }}</p>
          <span v-if="p.code" class="pill mt-2 text-accent-ink border-accent/60 bg-accent-soft font-mono tracking-wide">{{ p.code }}</span>
          <p v-if="p.valid_until" class="text-xs text-ink-mute mt-1.5">Valid until {{ p.valid_until }}</p>
        </div>
      </div>
    </div>
  </Scaffold>
</template>
