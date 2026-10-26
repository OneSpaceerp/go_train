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
const programs = ref([])
const loading = ref(true)
const assigningClient = ref(null)
const selectedProgram = ref('')
const saving = ref(false)

async function load() {
  ;[clients.value, programs.value] = await Promise.all([
    api.get('/coach/clients'),
    api.get('/programs'),
  ])
  if (programs.value.length && !selectedProgram.value) {
    selectedProgram.value = programs.value[0].id
  }
}
onMounted(async () => {
  try { await load() } finally { loading.value = false }
})

async function assignProgram(memberId) {
  if (!selectedProgram.value) return
  saving.value = true
  try {
    await api.post('/coach/assign', { member: memberId, program: selectedProgram.value })
    assigningClient.value = null
    await load()
  } finally {
    saving.value = false
  }
}
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
    <EmptyState v-else-if="!clients.length" icon="clients" title="No clients yet" subtitle="Add athletes in Desk to start coaching." />
    <div v-else class="card divide-y divide-line">
      <div v-for="c in clients" :key="c.id" class="p-4">
        <div class="flex items-center gap-3">
          <Avatar :name="c.full_name" :url="c.avatar_url" :size="44" />
          <div class="flex-1 min-w-0">
            <p class="font-semibold truncate">{{ c.full_name }}</p>
            <p class="text-xs text-ink-soft">
              {{ c.active_programs }} active program{{ c.active_programs === 1 ? '' : 's' }}
              <template v-if="c.goal"> · {{ c.goal }}</template>
            </p>
          </div>
          <button v-if="programs.length" class="btn-soft !h-8 !px-3 text-xs"
            @click="assigningClient = assigningClient === c.id ? null : c.id">
            Assign
          </button>
          <StatusPill :status="c.status" />
        </div>

        <div v-if="assigningClient === c.id" class="mt-3 pt-3 border-t border-line flex gap-2">
          <select v-model="selectedProgram" class="field !h-10 flex-1 text-sm">
            <option v-for="p in programs" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button class="btn-primary !h-10 !px-4 text-xs" :disabled="saving" @click="assignProgram(c.id)">
            {{ saving ? 'Assigning…' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Scaffold>
</template>
