<script setup>
// Small preview tile for a movement's media: photo, video frame, or YouTube
// thumbnail with a play badge. Tap to open it full size.
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { mediaKind, youtubeId, youtubeThumb } from '../lib/media.js'

const props = defineProps({
  item: { type: Object, required: true }, // { media, video_url }
  size: { type: Number, default: 64 },
  label: { type: String, default: 'Open media' },
})
defineEmits(['open'])

const kind = computed(() => mediaKind(props.item))
// Offline or blocked thumbnails fall back to a glyph instead of a broken image
const failed = ref(false)
watch(() => [props.item?.media, props.item?.video_url], () => (failed.value = false))
const ytThumb = computed(() => {
  const id = youtubeId(props.item?.video_url)
  return id ? youtubeThumb(id) : ''
})
</script>

<template>
  <button
    v-if="kind"
    type="button"
    class="media-thumb pressable"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-label="label"
    @click="$emit('open')"
  >
    <span v-if="failed" class="media-thumb-icon"><Icon :name="kind === 'image' ? 'image' : 'video'" :size="22" /></span>
    <img v-else-if="kind === 'image'" :src="item.media" alt="" loading="lazy" @error="failed = true" />
    <video v-else-if="kind === 'video'" :src="`${item.media}#t=0.1`" muted playsinline preload="metadata" @error="failed = true"></video>
    <img v-else-if="kind === 'youtube'" :src="ytThumb" alt="" loading="lazy" @error="failed = true" />
    <span v-else class="media-thumb-icon"><Icon :name="kind === 'link' ? 'link' : 'paperclip'" :size="22" /></span>
    <span v-if="kind === 'video' || kind === 'youtube'" class="media-thumb-play" aria-hidden="true">
      <Icon name="play" :size="14" :filled="true" />
    </span>
  </button>
</template>

<style scoped>
.media-thumb {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 14px;
  background: rgb(var(--sunk));
  border: 0.5px solid rgb(var(--line));
}
.media-thumb img,
.media-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
.media-thumb-icon {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: rgb(var(--ink-soft));
}
.media-thumb-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  color: #fff;
  backdrop-filter: blur(6px);
}
</style>
