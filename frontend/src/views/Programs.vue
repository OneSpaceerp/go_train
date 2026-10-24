<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'

const programs = ref([])
const loading = ref(true)
onMounted(async () => {
  try { programs.value = await api.get('/programs') } finally { loading.value = false }
})
const pct = (p) => (p.workout_count ? Math.round(((p.done_count || 0) / p.workout_count) * 100) : 0)
</script>

<template>
  <Scaffold title="Programs" back>
    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 4" :key="i" class="card p-4 h-24 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!programs.length" icon="programs" title="No programs yet" />
    <div v-else class="pt-4 space-y-3">
      <RouterLink v-for="p in programs" :key="p.id" :to="`/programs/${p.id}`" class="card p-4 block active:scale-[0.99] transition">
        <div class="flex items-center justify-between">
          <p class="font-semibold">{{ p.name }}</p>
          <span class="text-sm text-ink-soft">{{ p.done_count || 0 }}/{{ p.workout_count }} done</span>
        </div>
        <div class="mt-3 h-2 rounded-full bg-surface-sunk overflow-hidden">
          <div class="h-full bg-ink rounded-full" :style="{ width: pct(p) + '%' }"></div>
        </div>
      </RouterLink>
    </div>
  </Scaffold>
</template>
