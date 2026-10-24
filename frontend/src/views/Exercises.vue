<script setup>
import { ref, watch, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'

const q = ref('')
const exercises = ref([])
let timer
async function run() { exercises.value = await api.get(`/exercises?q=${encodeURIComponent(q.value.trim())}`) }
onMounted(run)
watch(q, () => { clearTimeout(timer); timer = setTimeout(run, 180) })
</script>

<template>
  <Scaffold title="Exercise library" back>
    <div class="py-3">
      <label class="field flex items-center gap-2">
        <Icon name="search" :size="20" class="text-ink-soft" />
        <input v-model="q" class="flex-1 bg-transparent outline-none text-base" placeholder="Search movements" />
      </label>
    </div>
    <EmptyState v-if="!exercises.length" icon="dumbbell" title="No movements found" />
    <div v-else class="card divide-y divide-line">
      <div v-for="e in exercises" :key="e.id" class="flex items-center gap-3 p-4">
        <div class="w-9 h-9 rounded-xl bg-surface-sunk grid place-items-center text-ink-soft"><Icon name="dumbbell" :size="18" /></div>
        <span class="flex-1 font-medium">{{ e.name }}</span>
        <span class="pill text-ink-soft border-line bg-surface-sunk">{{ e.category }}</span>
      </div>
    </div>
  </Scaffold>
</template>
