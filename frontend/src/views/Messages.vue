<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Avatar from '../components/Avatar.vue'
import EmptyState from '../components/EmptyState.vue'
import { onScreenReturn } from '../lib/useScreen.js'
import { api } from '../lib/api.js'
import { fromNow } from '../lib/format.js'
import { inbox, hasShare, clearInbox } from '../lib/launch.js'
import Icon from '../components/Icon.vue'

const threads = ref([])
const loading = ref(true)
async function load() {
  try { threads.value = await api.get('/threads') } finally { loading.value = false }
}
onMounted(load)
onScreenReturn(load)

// Content shared from another app waits here until a conversation is picked
const route = useRoute()
const router = useRouter()
const sharing = computed(() => route.query.share === '1' && hasShare())
const shareSummary = computed(() => {
  const n = inbox.files.length
  const files = n ? `${n} ${n === 1 ? 'file' : 'files'}` : ''
  return [files, inbox.text].filter(Boolean).join(' · ')
})
function cancelShare() {
  clearInbox()
  router.replace('/messages')
}
</script>

<template>
  <Scaffold title="Messages" tab>
    <div v-if="sharing" class="card mt-4 p-4 flex items-start gap-3 bg-accent-soft">
      <Icon name="send" :size="18" class="text-accent-ink mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-ink">Choose a conversation to send this to</p>
        <p class="text-sm text-ink-soft line-clamp-2" dir="auto">{{ shareSummary }}</p>
      </div>
      <button type="button" class="btn-soft !min-h-[44px] !px-3 text-sm" @click="cancelShare">Cancel</button>
    </div>
    <div v-if="loading" class="space-y-3 pt-4">
      <div v-for="i in 3" :key="i" class="card p-4 h-16 animate-pulse bg-surface-sunk"></div>
    </div>
    <EmptyState v-else-if="!threads.length" icon="message" title="No conversations yet"
      subtitle="Message your coach here. Workout-day notes stay on each training day." />
    <div v-else class="pt-4 card divide-y divide-line">
      <RouterLink v-for="t in threads" :key="t.id" :to="sharing ? `/threads/${t.id}?share=1` : `/threads/${t.id}`" class="flex items-center gap-3 p-4 active:bg-surface-sunk">
        <Avatar :name="t.other_name" :size="46" />
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate">{{ t.other_name }}</p>
          <p class="text-sm text-ink-soft truncate" dir="auto">{{ t.last_message || 'No messages yet' }}</p>
        </div>
        <span class="text-xs text-ink-mute shrink-0">{{ fromNow(t.last_at) }}</span>
      </RouterLink>
    </div>
  </Scaffold>
</template>
