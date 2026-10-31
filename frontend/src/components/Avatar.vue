<script setup>
import { initials } from '../lib/format.js'
defineProps({ name: String, size: { type: Number, default: 46 }, url: String })
</script>
<template>
  <div class="rounded-full bg-accent-soft text-accent-ink grid place-items-center font-semibold shrink-0 overflow-hidden"
       :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.36 + 'px' }">
    <img v-if="url" :src="url" :alt="name" class="w-full h-full object-cover" />
    <span v-else>{{ initials(name) }}</span>
  </div>
</template>
