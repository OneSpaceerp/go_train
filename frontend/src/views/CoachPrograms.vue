<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'

const programs = ref([])
const loading = ref(true)
const creating = ref(false)
const name = ref('')
const description = ref('')

async function load() { programs.value = await api.get('/programs') }
onMounted(async () => { try { await load() } finally { loading.value = false } })

async function create() {
  if (!name.value.trim()) return
  await api.post('/coach/programs', { name: name.value, description: description.value })
  name.value = ''; description.value = ''; creating.value = false
  await load()
}
</script>

<template>
  <Scaffold tab>
    <div class="flex items-center justify-between pt-5 pb-4">
      <h1 class="text-xl font-semibold">Programs</h1>
      <button class="btn-soft" @click="creating = !creating"><Icon name="plus" :size="18" /> New</button>
    </div>

    <form v-if="creating" class="card p-4 mb-4 space-y-2" @submit.prevent="create">
      <input v-model="name" class="field" placeholder="Program name" required />
      <textarea v-model="description" rows="2" class="field !h-auto py-3" placeholder="Description (optional)"></textarea>
      <button class="btn-primary w-full">Create program</button>
    </form>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="card p-4 h-20 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!programs.length" icon="programs" title="No programs yet" subtitle="Create your first training block." />
    <div v-else class="space-y-3">
      <RouterLink v-for="p in programs" :key="p.id" :to="`/programs/${p.id}`" class="card p-4 block active:bg-surface-sunk">
        <div class="flex items-center justify-between">
          <p class="font-semibold">{{ p.name }}</p>
          <Icon name="chevron" :size="18" class="text-ink-mute" />
        </div>
        <p class="text-sm text-ink-soft mt-1">{{ p.workout_count }} workouts · {{ p.client_count }} client{{ p.client_count === 1 ? '' : 's' }}</p>
      </RouterLink>
    </div>
  </Scaffold>
</template>
