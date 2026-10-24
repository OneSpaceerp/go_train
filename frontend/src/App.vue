<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
// Tab switches crossfade; going deeper/back slides.
const transition = computed(() => (route.meta.tab ? 'fade' : 'slide'))
</script>
<template>
  <RouterView v-slot="{ Component }">
    <Transition :name="transition" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
</template>
