<script setup>
// Attach a photo/video (camera or library) and/or a video link to a movement.
// v-model: { media, video_url }
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import MediaThumb from './MediaThumb.vue'
import { uploadFile } from '../lib/api.js'
import { normalizeVideoLink, youtubeId } from '../lib/media.js'
import { haptics } from '../lib/haptics.js'
import { t } from '../lib/i18n.js'

const props = defineProps({
  modelValue: { type: Object, default: () => ({ media: null, video_url: '' }) },
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'preview'])

const uploading = ref(false)
const error = ref('')
const link = ref(props.modelValue?.video_url || '')

const value = computed(() => props.modelValue || {})
const linkState = computed(() => {
  if (!link.value.trim()) return ''
  const url = normalizeVideoLink(link.value)
  if (!url) return 'invalid'
  return youtubeId(url) ? 'youtube' : 'link'
})

function update(patch) {
  emit('update:modelValue', { ...value.value, ...patch })
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  error.value = ''
  uploading.value = true
  try {
    const uploaded = await uploadFile(file)
    update({ media: uploaded.url })
    haptics.success()
  } catch (err) {
    haptics.error()
    error.value = `${err.message || t('media.uploadFailed', 'Upload failed')}. ${t('media.tryLink', 'For long videos, add a YouTube link instead.')}`
  } finally {
    uploading.value = false
  }
}

function onLink() {
  const url = normalizeVideoLink(link.value)
  update({ video_url: url || '' })
}

function clearLink() {
  link.value = ''
  update({ video_url: '' })
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="label" class="text-xs font-semibold text-ink-soft">{{ label }}</p>

    <!-- Photo / video -->
    <div class="flex items-center gap-3">
      <MediaThumb v-if="value.media" :item="{ media: value.media }" :size="64" @open="$emit('preview', { media: value.media })" />
      <label class="btn-soft flex-1 cursor-pointer" :class="{ 'opacity-60 pointer-events-none': uploading }">
        <Icon :name="value.media ? 'refresh' : 'camera'" :size="18" />
        <span class="truncate">
          {{ uploading ? t('workout.uploading', 'Uploading…') : value.media ? t('media.replace', 'Replace photo / video') : t('media.add', 'Photo or video') }}
        </span>
        <input type="file" class="sr-only" accept="image/*,video/*" @change="onFile" />
      </label>
      <button
        v-if="value.media"
        type="button"
        class="icon-btn text-bad"
        :aria-label="t('media.remove', 'Remove photo / video')"
        @click="update({ media: null })"
      >
        <Icon name="trash" :size="18" />
      </button>
    </div>

    <!-- Video link -->
    <div>
      <div class="field flex items-center gap-2 !px-3">
        <Icon name="link" :size="18" class="text-ink-mute shrink-0" />
        <input
          v-model="link"
          type="url"
          inputmode="url"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="done"
          class="flex-1 min-w-0 bg-transparent outline-none text-base"
          :placeholder="t('media.linkPlaceholder', 'YouTube or video link')"
          @change="onLink"
          @blur="onLink"
        />
        <button v-if="link" type="button" class="icon-btn" :aria-label="t('media.clearLink', 'Clear link')" @click="clearLink">
          <Icon name="x" :size="15" />
        </button>
      </div>
      <p v-if="linkState === 'invalid'" class="text-bad text-xs mt-1.5">{{ t('media.badLink', 'That doesn’t look like a web link.') }}</p>
      <p v-else-if="linkState === 'youtube'" class="text-ok text-xs mt-1.5">{{ t('media.youtubeOk', 'YouTube video — it will play right here.') }}</p>
    </div>

    <p v-if="error" class="text-bad text-xs" role="alert">{{ error }}</p>
  </div>
</template>
