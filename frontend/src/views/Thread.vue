<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import Scaffold from '../components/Scaffold.vue'
import Icon from '../components/Icon.vue'
import MediaThumb from '../components/MediaThumb.vue'
import MediaViewer from '../components/MediaViewer.vue'
import { api, uploadFile } from '../lib/api.js'
import { inbox, clearInbox, MAX_SHARED_FILES } from '../lib/launch.js'
import { haptics } from '../lib/haptics.js'

const route = useRoute()
const messages = ref([])
const text = ref('')
const files = ref([]) // File objects waiting to be sent
const sending = ref(false)
const scroller = ref(null)
const error = ref('')
const viewing = ref(null)

// Content shared from another app (see lib/launch.js) becomes the draft
if (route.query.share === '1') {
  text.value = inbox.text.replace(/\s*\n\s*/g, ' ') // the composer is a single line
  files.value = [...inbox.files]
  clearInbox()
}

async function load() {
  try {
    messages.value = await api.get(`/threads/${route.params.id}/messages`)
  } catch (err) {
    error.value = err?.message || 'Could not load this conversation'
    return
  }
  await nextTick(); scroll()
}
function scroll() { scroller.value && (scroller.value.scrollTop = scroller.value.scrollHeight) }
onMounted(load)

// Uploaded files are sent as their own lines in the message body
const FILE_LINE = /^\/(private\/)?files\/\S+$/
function parts(body) {
  const lines = String(body || '').split('\n')
  return {
    text: lines.filter((l) => !FILE_LINE.test(l.trim())).join('\n').trim(),
    files: lines.map((l) => l.trim()).filter((l) => FILE_LINE.test(l)),
  }
}

function addFiles(e) {
  const picked = [...(e.target.files || [])]
  e.target.value = ''
  files.value = [...files.value, ...picked].slice(0, MAX_SHARED_FILES)
}

async function send() {
  if ((!text.value.trim() && !files.value.length) || sending.value) return
  error.value = ''
  sending.value = true
  let m
  try {
    const urls = []
    for (const file of files.value) urls.push((await uploadFile(file)).url)
    m = await api.post(`/threads/${route.params.id}/messages`, { body: text.value, files: urls })
  } catch (err) {
    haptics.error()
    error.value = err?.message || 'Message not sent'
    return
  } finally {
    sending.value = false
  }
  messages.value.push(m); text.value = ''; files.value = []
  await nextTick(); scroll()
}
</script>

<template>
  <Scaffold title="Chat" back>
    <div ref="scroller" class="py-4 space-y-2 overflow-y-auto" style="min-height: 60vh">
      <div v-for="m in messages" :key="m.id" class="flex" :class="m.mine ? 'justify-end' : 'justify-start'">
        <div class="max-w-[78%] px-3.5 py-2 rounded-2xl text-[0.9rem] space-y-2" dir="auto"
          :class="m.mine ? 'bg-accent text-accent-on rounded-br-md' : 'bg-surface rounded-bl-md shadow-card'">
          <p v-if="parts(m.body).text" class="whitespace-pre-line">{{ parts(m.body).text }}</p>
          <div v-if="parts(m.body).files.length" class="flex flex-wrap gap-1.5">
            <MediaThumb v-for="url in parts(m.body).files" :key="url" :item="{ media: url }" :size="96" @open="viewing = { media: url }" />
          </div>
        </div>
      </div>
    </div>
    <p v-if="error" class="text-bad text-sm px-1" role="alert">{{ error }}</p>
    <div class="sticky bottom-0 bg-surface-page pt-2 pb-[env(safe-area-inset-bottom)]">
      <div v-if="files.length" class="flex flex-wrap gap-2 mb-2">
        <span v-for="(f, i) in files" :key="i" class="pill border-line bg-surface text-ink-soft !py-1 max-w-full">
          <Icon name="paperclip" :size="14" />
          <span class="truncate max-w-[10rem]">{{ f.name }}</span>
          <button type="button" class="-me-1 p-1" :aria-label="`Remove ${f.name}`" @click="files.splice(i, 1)">
            <Icon name="x" :size="14" />
          </button>
        </span>
      </div>
      <div class="flex gap-2">
        <label class="icon-btn w-12 h-12 shrink-0 cursor-pointer" aria-label="Attach photo or video">
          <Icon name="paperclip" :size="18" />
          <input type="file" class="sr-only" accept="image/*,video/*" multiple @change="addFiles" />
        </label>
        <input v-model="text" class="field" placeholder="Write your comment here …" dir="auto" @keyup.enter="send" />
        <button class="icon-btn bg-accent text-accent-on w-12 h-12 shrink-0" aria-label="Send" :disabled="sending" @click="send">
          <Icon name="send" :size="18" />
        </button>
      </div>
    </div>
    <MediaViewer :open="Boolean(viewing)" title="Attachment" :item="viewing" @close="viewing = null" />
  </Scaffold>
</template>
