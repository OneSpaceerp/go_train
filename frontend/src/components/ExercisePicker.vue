<script setup>
// Pick a movement from the gym's exercise library.
import { ref, watch } from 'vue'
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'

const props = defineProps({ open: Boolean, exclude: { type: Array, default: () => [] } })
const emit = defineEmits(['pick', 'close'])

const q = ref('')
const rows = ref([])
const loading = ref(false)
let timer = null

async function search() {
  loading.value = true
  try {
    rows.value = (await api.get(`/exercises?q=${encodeURIComponent(q.value.trim())}`)) || []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    q.value = ''
    search()
  },
)

function onInput() {
  clearTimeout(timer)
  timer = setTimeout(search, 200)
}

function pick(row) {
  emit('close')
  emit('pick', row.name)
}
</script>

<template>
  <BottomSheet :open="open" :title="t('movement.add', 'Add movement')" @close="emit('close')">
    <div class="field flex items-center gap-2 !px-3 mb-3">
      <Icon name="search" :size="18" class="text-ink-mute shrink-0" />
      <input
        v-model="q"
        type="search"
        enterkeyhint="search"
        class="flex-1 min-w-0 bg-transparent outline-none text-base"
        :placeholder="t('movement.search', 'Search movements')"
        @input="onInput"
      />
    </div>
    <div class="list-group">
      <button
        v-for="row in rows"
        :key="row.id"
        type="button"
        class="list-row"
        :disabled="exclude.includes(row.name)"
        @click="pick(row)"
      >
        <span class="flex-1 min-w-0 text-start">
          <span class="block font-semibold text-ink truncate">{{ row.name }}</span>
          <span class="block text-xs text-ink-mute truncate">{{ [row.category, row.primary_muscle, row.equipment].filter(Boolean).join(' · ') }}</span>
        </span>
        <Icon v-if="exclude.includes(row.name)" name="check" :size="18" class="text-ok" />
        <Icon v-else name="plus" :size="18" class="text-brand-650" />
      </button>
      <p v-if="!loading && !rows.length" class="p-4 text-sm text-ink-mute text-center">
        {{ t('movement.none', 'No movements found.') }}
      </p>
    </div>
  </BottomSheet>
</template>
