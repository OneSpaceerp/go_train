<script setup>
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const props = defineProps({
  title: String,
  subtitle: String,
  back: Boolean,
  scrolled: Boolean,
})
const router = useRouter()

function goBack() {
  haptics.tap()
  if (window.history.length > 1) router.back()
  else router.replace('/')
}
</script>

<template>
  <header
    class="sticky top-0 z-30 glass-bar transition-colors duration-200"
    :class="scrolled ? 'border-b shadow-sm' : 'border-b border-transparent'"
    style="padding-top: env(safe-area-inset-top);"
  >
    <div class="mx-auto max-w-[36rem] flex items-center gap-1 min-h-[56px] px-2">
      <button
        v-if="back"
        type="button"
        class="icon-btn text-brand-600 -ml-0.5"
        :aria-label="t('nav.back')"
        @click="goBack"
      >
        <Icon name="back" :size="22" />
      </button>
      <div v-else class="w-2"></div>

      <div class="flex-1 min-w-0" :class="back ? '' : 'px-1'">
        <h1 class="text-[1.0625rem] font-semibold tracking-tight text-ink truncate leading-tight">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="text-[0.75rem] text-ink-mute truncate leading-tight mt-0.5">
          {{ subtitle }}
        </p>
      </div>

      <div class="flex items-center gap-0.5">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
