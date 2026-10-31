<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import Icon from '../components/Icon.vue'
import StatusPill from '../components/StatusPill.vue'
import EmptyState from '../components/EmptyState.vue'
import BottomSheet from '../components/BottomSheet.vue'
import { onScreenReturn } from '../lib/useScreen.js'
import { api } from '../lib/api.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const clients = ref(api.cached('/coach/clients') || [])
const programs = ref(api.cached('/coach/programs') || [])
const loading = ref(!clients.value.length)
const assigningClient = ref(null)
const selectedProgram = ref('')
const saving = ref(false)
const error = ref('')

async function load() {
  try {
    ;[clients.value, programs.value] = await Promise.all([
      api.get('/coach/clients'),
      api.get('/coach/programs'),
    ])
    if (programs.value.length && !selectedProgram.value) {
      selectedProgram.value = programs.value[0].id
    }
  } finally {
    loading.value = false
  }
}
onMounted(load)
onScreenReturn(load)

function openAssign(client) {
  haptics.tap()
  assigningClient.value = client
}

async function assignProgram() {
  if (!assigningClient.value || !selectedProgram.value) return
  saving.value = true
  error.value = ''
  haptics.medium()
  try {
    await api.post('/coach/assign', {
      member: assigningClient.value.id,
      program: selectedProgram.value,
    })
    haptics.success()
    assigningClient.value = null
    await load()
  } catch (err) {
    error.value = err?.message || 'Could not assign the program'
    haptics.error()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Scaffold :title="t('tab.clients')" tab :onRefresh="load">
    <template #actions>
      <RouterLink to="/messages" class="icon-btn" aria-label="Messages">
        <Icon name="message" :size="20" />
      </RouterLink>
    </template>

    <div class="pt-3">
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="card p-4 h-16 animate-pulse bg-surface-sunk"></div>
      </div>
      <EmptyState
        v-else-if="!clients.length"
        icon="clients"
        title="No athletes assigned yet"
        subtitle="Add athletes in Desk to start managing their programs."
      />
      <div v-else class="card divide-y divide-line overflow-hidden">
        <div v-for="c in clients" :key="c.id" class="p-4 flex items-center gap-3">
          <Avatar :name="c.full_name" :url="c.avatar_url" :size="46" />
          <div class="flex-1 min-w-0">
            <p class="font-bold text-ink truncate">{{ c.full_name }}</p>
            <p class="text-xs text-ink-mute truncate mt-0.5 tabular-nums">
              {{ c.active_programs }} active program{{ c.active_programs === 1 ? '' : 's' }}
              <template v-if="c.goal"> · {{ c.goal }}</template>
            </p>
          </div>
          <button
            v-if="programs.length"
            type="button"
            class="btn-soft !min-h-[44px] !px-3.5 text-sm"
            @click="openAssign(c)"
          >
            Assign
          </button>
          <StatusPill :status="c.status" />
        </div>
      </div>
    </div>

    <!-- Assign Program Sheet -->
    <BottomSheet
      :open="Boolean(assigningClient)"
      :title="`Assign Program · ${assigningClient?.full_name || ''}`"
      @close="assigningClient = null"
    >
      <form class="space-y-4 pb-2" @submit.prevent="assignProgram">
        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1.5">
            Select Training Program
          </label>
          <select v-model="selectedProgram" class="field">
            <option v-for="p in programs" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
        </div>
        <p v-if="error" class="text-bad text-sm" role="alert">{{ error }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="saving">
          <Icon name="check" :size="18" />
          {{ saving ? 'Assigning…' : 'Confirm Assignment' }}
        </button>
      </form>
    </BottomSheet>
  </Scaffold>
</template>
