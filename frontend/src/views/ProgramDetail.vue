<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import Scaffold from '../components/Scaffold.vue'
import StatusPill from '../components/StatusPill.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import BottomSheet from '../components/BottomSheet.vue'
import { api } from '../lib/api.js'
import { isCoach, session } from '../lib/session.js'
import { niceDate } from '../lib/format.js'
import { haptics } from '../lib/haptics.js'

const route = useRoute()
const workouts = ref([])
const loading = ref(true)
const canEdit = isCoach() || session.user?.is_coach

// New workout sheet (for coaches)
const showAdd = ref(false)
const title = ref('')
const letter = ref('A')
const scheduledOn = ref(dayjs().format('YYYY-MM-DD'))
const body = ref('')
const saving = ref(false)
const error = ref('')

async function load() {
  workouts.value = await api.get(`/programs/${route.params.id}/workouts`)
}
onMounted(async () => {
  try {
    await load()
  } finally {
    loading.value = false
  }
})

async function createWorkout() {
  if (!title.value.trim() || !body.value.trim()) return
  saving.value = true
  error.value = ''
  haptics.medium()
  try {
    await api.post(`/programs/${route.params.id}/workouts`, {
      title: title.value,
      letter: letter.value || 'A',
      scheduled_on: scheduledOn.value,
      body: body.value,
    })
    haptics.success()
    title.value = ''
    body.value = ''
    showAdd.value = false
    await load()
  } catch (err) {
    error.value = err?.message || 'Could not add the workout'
    haptics.error()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Scaffold title="Program" back :onRefresh="load">
    <template v-if="canEdit" #actions>
      <button
        type="button"
        class="btn-soft !min-h-[44px] !px-3.5 mr-1 text-sm"
        @click="haptics.tap(); showAdd = true"
      >
        <Icon name="plus" :size="16" /> Add Workout
      </button>
    </template>

    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 3" :key="i" class="card p-4 h-20 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState
      v-else-if="!workouts.length"
      icon="dumbbell"
      title="No workouts in this program yet"
      subtitle="Add the first training day using the button above."
    />
    <div v-else class="pt-4 space-y-3">
      <RouterLink
        v-for="w in workouts"
        :key="w.id"
        :to="`/workouts/${w.id}`"
        class="card p-4 block active:bg-surface-sunk transition"
      >
        <div class="flex items-center gap-2.5">
          <span
            v-if="w.letter"
            class="w-7 h-7 rounded-lg bg-ink text-surface grid place-items-center text-xs font-bold shrink-0"
          >
            {{ w.letter }}
          </span>
          <span class="font-bold text-ink flex-1 truncate">{{ w.title }}</span>
          <span v-if="w.scheduled_on" class="text-xs text-ink-mute tabular-nums">
            {{ niceDate(w.scheduled_on) }}
          </span>
          <StatusPill v-if="w.my_log" :status="w.my_log.status" />
          <Icon name="chevron" :size="18" class="text-ink-mute" />
        </div>
        <p
          class="text-sm text-ink-soft mt-1.5 line-clamp-2 whitespace-pre-line"
          dir="auto"
        >
          {{ w.body }}
        </p>
      </RouterLink>
    </div>

    <!-- Coach: Add Workout Sheet -->
    <BottomSheet
      :open="showAdd"
      title="New Training Day"
      @close="showAdd = false"
    >
      <form class="space-y-3.5 pb-2" @submit.prevent="createWorkout">
        <div class="grid grid-cols-[5rem_1fr] gap-2.5">
          <div>
            <label class="text-xs font-semibold text-ink-soft block mb-1">Block</label>
            <input
              v-model="letter"
              class="field text-center font-bold"
              placeholder="A"
              maxlength="4"
            />
          </div>
          <div>
            <label class="text-xs font-semibold text-ink-soft block mb-1">Workout Title</label>
            <input
              v-model="title"
              class="field"
              placeholder="e.g. Back Squat + Fran"
              required
            />
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1">Scheduled Date</label>
          <input v-model="scheduledOn" type="date" class="field tabular-nums" required />
        </div>

        <div>
          <label class="text-xs font-semibold text-ink-soft block mb-1">
            Prescription &amp; Notes
          </label>
          <textarea
            v-model="body"
            rows="4"
            class="field !min-h-[110px] py-3"
            placeholder="Prescribed sets, reps, weights, and WOD instructions…"
            required
          ></textarea>
        </div>

        <p v-if="error" class="text-bad text-sm" role="alert">{{ error }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="saving">
          <Icon name="check" :size="18" />
          {{ saving ? 'Saving…' : 'Publish Workout' }}
        </button>
      </form>
    </BottomSheet>
  </Scaffold>
</template>
