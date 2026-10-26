<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import Scaffold from '../components/Scaffold.vue'
import StatusPill from '../components/StatusPill.vue'
import Icon from '../components/Icon.vue'
import EmptyState from '../components/EmptyState.vue'
import { api } from '../lib/api.js'
import { isCoach, session } from '../lib/session.js'
import { niceDate } from '../lib/format.js'

const route = useRoute()
const workouts = ref([])
const loading = ref(true)
const canEdit = isCoach() || session.user?.is_coach

// New workout form (for coaches)
const showAdd = ref(false)
const title = ref('')
const letter = ref('A')
const scheduledOn = ref(dayjs().format('YYYY-MM-DD'))
const body = ref('')
const saving = ref(false)

async function load() {
  workouts.value = await api.get(`/programs/${route.params.id}/workouts`)
}
onMounted(async () => {
  try { await load() } finally { loading.value = false }
})

async function createWorkout() {
  if (!title.value.trim() || !body.value.trim()) return
  saving.value = true
  try {
    await api.post(`/programs/${route.params.id}/workouts`, {
      title: title.value,
      letter: letter.value || 'A',
      scheduled_on: scheduledOn.value,
      body: body.value,
    })
    title.value = ''
    body.value = ''
    showAdd.value = false
    await load()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Scaffold title="Program" back>
    <template v-if="canEdit" #actions>
      <button class="btn-soft !h-9 !px-3 mr-1 text-xs" @click="showAdd = !showAdd">
        <Icon name="plus" :size="16" /> Add workout
      </button>
    </template>

    <!-- Coach: Add Workout form -->
    <form v-if="showAdd" class="card p-4 mt-4 space-y-2.5" @submit.prevent="createWorkout">
      <p class="section-label">New Training Day</p>
      <div class="flex gap-2">
        <input v-model="letter" class="field !h-11 !w-20 text-center font-bold" placeholder="A" maxlength="4" />
        <input v-model="title" class="field !h-11 flex-1" placeholder="Workout title (e.g. Back Squat + Fran)" required />
      </div>
      <input v-model="scheduledOn" type="date" class="field !h-11" required />
      <textarea v-model="body" rows="4" class="field !h-auto py-3" placeholder="Prescribed sets, reps, weights, and WOD instructions…" required></textarea>
      <button class="btn-primary w-full !h-11" :disabled="saving">
        {{ saving ? 'Adding…' : 'Save workout' }}
      </button>
    </form>

    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 3" :key="i" class="card p-4 h-20 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!workouts.length" icon="dumbbell" title="No workouts in this program yet" />
    <div v-else class="pt-4 space-y-3">
      <RouterLink v-for="w in workouts" :key="w.id" :to="`/workouts/${w.id}`" class="card p-4 block active:bg-surface-sunk">
        <div class="flex items-center gap-2">
          <span v-if="w.letter" class="w-7 h-7 rounded-lg bg-ink text-surface grid place-items-center text-xs font-bold">{{ w.letter }}</span>
          <span class="font-bold flex-1">{{ w.title }}</span>
          <span v-if="w.scheduled_on" class="text-xs text-ink-soft">{{ niceDate(w.scheduled_on) }}</span>
          <StatusPill v-if="w.my_log" :status="w.my_log.status" />
          <Icon name="chevron" :size="18" class="text-ink-mute" />
        </div>
        <p class="text-sm text-ink-soft mt-1 line-clamp-2 whitespace-pre-line" dir="auto">{{ w.body }}</p>
      </RouterLink>
    </div>
  </Scaffold>
</template>
