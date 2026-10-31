<script setup>
// iOS-style action sheet: a short list of actions in a bottom sheet.
// Picking an action closes the sheet and then emits `select` with its key.
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import { haptics } from '../lib/haptics.js'

defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  // [{ key, label, icon?, detail?, destructive?, disabled? }]
  actions: { type: Array, default: () => [] },
})
const emit = defineEmits(['select', 'close'])

function pick(action) {
  if (action.disabled) return
  haptics.select()
  emit('close')
  emit('select', action.key)
}
</script>

<template>
  <BottomSheet :open="open" :title="title" @close="emit('close')">
    <div class="action-list" role="menu">
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        role="menuitem"
        class="action-row"
        :class="{ 'action-row--destructive': action.destructive }"
        :disabled="action.disabled"
        @click="pick(action)"
      >
        <span v-if="action.icon" class="action-icon"><Icon :name="action.icon" :size="20" /></span>
        <span class="flex-1 min-w-0 text-start truncate">{{ action.label }}</span>
        <span v-if="action.detail" class="text-sm text-ink-mute shrink-0">{{ action.detail }}</span>
      </button>
    </div>
  </BottomSheet>
</template>
