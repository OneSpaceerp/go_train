<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import { api } from '../lib/api.js'

const route = useRoute()
const messages = ref([])
const text = ref('')
const scroller = ref(null)

async function load() {
  messages.value = await api.get(`/threads/${route.params.id}/messages`)
  await nextTick(); scroll()
}
function scroll() { scroller.value && (scroller.value.scrollTop = scroller.value.scrollHeight) }
onMounted(load)

async function send() {
  if (!text.value.trim()) return
  const m = await api.post(`/threads/${route.params.id}/messages`, { body: text.value })
  messages.value.push(m); text.value = ''
  await nextTick(); scroll()
}
</script>

<template>
  <Scaffold title="Chat" back>
    <div ref="scroller" class="py-4 space-y-2 overflow-y-auto" style="min-height: 60vh">
      <div v-for="m in messages" :key="m.id" class="flex" :class="m.mine ? 'justify-end' : 'justify-start'">
        <div class="max-w-[78%] px-3.5 py-2 rounded-2xl text-[0.9rem]" dir="auto"
          :class="m.mine ? 'bg-brand-600 text-white rounded-br-md' : 'bg-surface rounded-bl-md shadow-card'">
          {{ m.body }}
        </div>
      </div>
    </div>
    <div class="sticky bottom-0 bg-surface-page pt-2 pb-[env(safe-area-inset-bottom)]">
      <div class="flex gap-2">
        <input v-model="text" class="field" placeholder="Write your comment here …" dir="auto" @keyup.enter="send" />
        <button class="icon-btn bg-brand-600 text-white w-12 h-12" aria-label="Send" @click="send"><Icon name="send" :size="18" /></button>
      </div>
    </div>
  </Scaffold>
</template>
