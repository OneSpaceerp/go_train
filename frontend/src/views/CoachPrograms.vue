<script setup>
import { ref, onMounted } from 'vue'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import BottomSheet from '../components/BottomSheet.vue'
import { onScreenReturn } from '../lib/useScreen.js'
import { api } from '../lib/api.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const programs = ref(api.cached('/coach/programs') || [])
const loading = ref(!programs.value.length)
const creating = ref(false)
const name = ref('')
const description = ref('')
const publish = ref(false)
const saving = ref(false)
const error = ref('')

async function load() {
  try {
    programs.value = await api.get('/coach/programs')
  } finally {
    loading.value = false
  }
}
onMounted(load)
onScreenReturn(load)

async function create() {
  if (!name.value.trim()) return
  saving.value = true
  error.value = ''
  haptics.medium()
  try {
    await api.post('/coach/programs', {
      name: name.value,
      description: description.value,
      is_published: publish.value,
    })
    haptics.success()
    name.value = ''
    description.value = ''
    publish.value = false
    creating.value = false
    await load()
  } catch (err) {
    error.value = err?.message || 'Could not create the program'
    haptics.error()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Scaffold :title="t('tab.programs')" tab :onRefresh="load">
    <template #actions>
      <button
        type="button"
        class="btn-soft !min-h-[40px] !px-3.5 mr-1 text-xs"
        @click="haptics.tap(); creating = true"
      >
        <Icon name="plus" :size="16" /> New Program
      </button>
    </template>

    <div class="pt-3">
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="card p-4 h-20 animate-pulse bg-surface-sunk"></div>
      </div>
      <EmptyState
        v-else-if="!programs.length"
        icon="programs"
        title="No programs yet"
        subtitle="Create your first training block."
      />
      <div v-else class="space-y-3">
        <RouterLink
          v-for="p in programs"
          :key="p.id"
          :to="`/programs/${p.id}`"
          class="card p-4 block active:bg-surface-sunk transition"
        >
          <div class="flex items-center justify-between">
            <p class="font-bold text-ink">{{ p.name }}</p>
            <Icon name="chevron" :size="18" class="text-ink-mute" />
          </div>
          <p class="text-xs font-medium text-ink-mute mt-1 tabular-nums">
            {{ p.workout_count || 0 }} workouts · {{ p.client_count || 0 }} athlete{{
              p.client_count === 1 ? '' : 's'
            }}
            <template v-if="!p.is_published"> · Draft</template>
          </p>
        </RouterLink>
      </div>
    </div>

    <BottomSheet
      :open="creating"
      title="Create Training Program"
      @close="creating = false"
    >
      <form class="space-y-3.5 pb-2" @submit.prevent="create">
        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1">Program Name</label>
          <input
            v-model="name"
            class="field"
            placeholder="e.g. Strength & Engine 8-Week Block"
            required
          />
        </div>
        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1">Description</label>
          <textarea
            v-model="description"
            rows="3"
            class="field !min-h-[84px] py-2.5"
            placeholder="Overview, target level, weekly structure…"
          ></textarea>
        </div>
        <label class="flex items-center gap-2.5 text-sm text-ink min-h-[44px]">
          <input v-model="publish" type="checkbox" class="w-5 h-5 accent-brand-600" />
          Publish to the Marketplace
        </label>
        <p v-if="error" class="text-bad text-sm" role="alert">{{ error }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="saving">
          <Icon name="check" :size="18" />
          {{ saving ? 'Creating…' : 'Create Program' }}
        </button>
      </form>
    </BottomSheet>
  </Scaffold>
</template>
