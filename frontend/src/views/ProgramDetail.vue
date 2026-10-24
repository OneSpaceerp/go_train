<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import StatusPill from '../components/StatusPill.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'

const route = useRoute()
const workouts = ref([])
const loading = ref(true)
onMounted(async () => {
  try { workouts.value = await api.get(`/programs/${route.params.id}/workouts`) } finally { loading.value = false }
})
</script>

<template>
  <Scaffold title="Program" back>
    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 3" :key="i" class="card p-4 h-20 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!workouts.length" icon="dumbbell" title="No workouts in this program yet" />
    <div v-else class="pt-4 space-y-3">
      <RouterLink v-for="w in workouts" :key="w.id" :to="`/workouts/${w.id}`" class="card p-4 block active:bg-surface-sunk">
        <div class="flex items-center gap-2">
          <span v-if="w.letter" class="w-7 h-7 rounded-lg bg-ink text-surface grid place-items-center text-xs font-bold">{{ w.letter }}</span>
          <span class="font-bold flex-1">{{ w.title }}</span>
          <StatusPill v-if="w.my_log" :status="w.my_log.status" />
          <Icon name="chevron" :size="18" class="text-ink-mute" />
        </div>
        <p class="text-sm text-ink-soft mt-1 line-clamp-2 whitespace-pre-line" dir="auto">{{ w.body }}</p>
      </RouterLink>
    </div>
  </Scaffold>
</template>
