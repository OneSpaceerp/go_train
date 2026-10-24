<script setup>
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
defineProps({ title: String, back: Boolean })
const router = useRouter()
</script>

<template>
  <header class="sticky top-0 z-30 flex items-center gap-1 h-[60px] px-2 bg-surface/85 backdrop-blur-md border-b border-line"
          style="padding-top: env(safe-area-inset-top);">
    <button v-if="back" class="icon-btn text-brand-600" @click="router.back()" aria-label="Back">
      <Icon name="back" />
    </button>
    <div v-else class="w-2"></div>
    <h1 class="flex-1 text-[1.0625rem] font-semibold truncate" :class="back ? '' : 'px-1'">{{ title }}</h1>
    <slot name="actions" />
  </header>
</template>
