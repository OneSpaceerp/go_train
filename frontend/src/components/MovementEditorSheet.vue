<script setup>
// Coach: add or edit one prescribed movement — name (with library
// suggestions), sets, reps, load, rest, notes, and a demo photo/video or
// YouTube link that athletes can play while training.
import { ref, watch } from 'vue'
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import MediaInput from './MediaInput.vue'
import { api } from '../lib/api.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const props = defineProps({
  open: Boolean,
  movement: { type: Object, default: null }, // null = new movement
  saving: Boolean,
  error: { type: String, default: '' },
})
const emit = defineEmits(['save', 'delete', 'close', 'preview'])

const blank = () => ({ exercise: '', sets: 3, reps: '', weight: '', rest: '', notes: '', media: null, video_url: '' })
const form = ref(blank())
const suggestions = ref([])
let searchTimer = null

watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = { ...blank(), ...(props.movement || {}) }
    form.value.video_url = form.value.video_url || ''
    suggestions.value = []
  },
)

function onName() {
  clearTimeout(searchTimer)
  const q = form.value.exercise.trim()
  if (q.length < 2) {
    suggestions.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const rows = await api.get(`/exercises?q=${encodeURIComponent(q)}`)
      suggestions.value = (rows || []).filter((r) => r.name.toLowerCase() !== q.toLowerCase()).slice(0, 5)
    } catch {
      suggestions.value = []
    }
  }, 220)
}

function pickSuggestion(row) {
  haptics.select()
  form.value.exercise = row.name
  suggestions.value = []
}

function stepSets(delta) {
  haptics.select()
  form.value.sets = Math.max(1, Math.min(20, (Number(form.value.sets) || 0) + delta))
}

function save() {
  if (!form.value.exercise.trim()) return
  emit('save', { ...form.value, exercise: form.value.exercise.trim() })
}
</script>

<template>
  <BottomSheet :open="open" :title="movement ? t('movement.edit', 'Edit movement') : t('movement.add', 'Add movement')" @close="emit('close')">
    <template #action>
      <button type="button" class="sheet-done" :disabled="saving || !form.exercise.trim()" @click="save">
        {{ saving ? t('nav.saving', 'Saving…') : t('nav.save') }}
      </button>
    </template>

    <form class="space-y-4 pb-2" @submit.prevent="save">
      <div>
        <label class="form-label" for="mv-name">{{ t('movement.name', 'Movement') }}</label>
        <input
          id="mv-name"
          v-model="form.exercise"
          class="field"
          autocomplete="off"
          enterkeyhint="next"
          :placeholder="t('movement.namePlaceholder', 'e.g. Back Squat')"
          @input="onName"
        />
        <div v-if="suggestions.length" class="mt-2 flex flex-wrap gap-2">
          <button v-for="s in suggestions" :key="s.id" type="button" class="chip" @click="pickSuggestion(s)">
            {{ s.name }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="form-label">{{ t('movement.sets', 'Sets') }}</span>
          <div class="stepper">
            <button type="button" :aria-label="t('movement.fewerSets', 'Fewer sets')" @click="stepSets(-1)"><Icon name="minus" :size="18" /></button>
            <output class="tabular-nums" aria-live="polite">{{ form.sets }}</output>
            <button type="button" :aria-label="t('movement.moreSets', 'More sets')" @click="stepSets(1)"><Icon name="plus" :size="18" /></button>
          </div>
        </div>
        <div>
          <label class="form-label" for="mv-reps">{{ t('movement.reps', 'Reps') }}</label>
          <input id="mv-reps" v-model="form.reps" class="field text-center" inputmode="text" enterkeyhint="next" placeholder="5 or 8–10" />
        </div>
        <div>
          <label class="form-label" for="mv-load">{{ t('movement.load', 'Load') }}</label>
          <input id="mv-load" v-model="form.weight" class="field text-center" enterkeyhint="next" placeholder="100 kg / 75%" />
        </div>
        <div>
          <label class="form-label" for="mv-rest">{{ t('movement.rest', 'Rest') }}</label>
          <input id="mv-rest" v-model="form.rest" class="field text-center" enterkeyhint="next" placeholder="90s" />
        </div>
      </div>

      <div>
        <label class="form-label" for="mv-notes">{{ t('movement.notes', 'Coaching cues') }}</label>
        <textarea id="mv-notes" v-model="form.notes" rows="2" class="field py-3" dir="auto" :placeholder="t('movement.notesPlaceholder', 'Tempo, scaling, form cues…')"></textarea>
      </div>

      <MediaInput
        v-model="form"
        :label="t('movement.demo', 'Demo for athletes')"
        @preview="emit('preview', $event)"
      />

      <p v-if="error" class="text-bad text-sm" role="alert">{{ error }}</p>

      <button v-if="movement" type="button" class="btn-outline w-full !text-bad" @click="emit('delete')">
        <Icon name="trash" :size="18" /> {{ t('movement.delete', 'Remove movement') }}
      </button>
    </form>
  </BottomSheet>
</template>
