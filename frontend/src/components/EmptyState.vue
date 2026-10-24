<script setup>
import Icon from './Icon.vue'
defineProps({ icon: { type: String, default: 'dumbbell' }, title: String, subtitle: String })
</script>
<template>
  <div class="flex flex-col items-center text-center px-8 py-16 text-ink-soft">
    <div class="w-16 h-16 rounded-2xl bg-surface-sunk grid place-items-center text-ink-mute mb-4">
      <Icon :name="icon" :size="30" />
    </div>
    <p class="text-[1.0625rem] font-semibold text-ink">{{ title }}</p>
    <p v-if="subtitle" class="mt-1 text-sm max-w-xs">{{ subtitle }}</p>
    <slot />
  </div>
</template>
