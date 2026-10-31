<script setup>
// Plays or shows a movement's media in a sheet: photo, uploaded video, an
// embedded YouTube player, or a button to open any other video link.
import { computed } from 'vue'
import BottomSheet from './BottomSheet.vue'
import Icon from './Icon.vue'
import { mediaKind, youtubeId, youtubeEmbed } from '../lib/media.js'
import { t } from '../lib/i18n.js'

const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  item: { type: Object, default: null }, // { media, video_url, note }
})
defineEmits(['close'])

const kind = computed(() => (props.item ? mediaKind(props.item) : null))
const embed = computed(() => {
  const id = youtubeId(props.item?.video_url)
  return id ? youtubeEmbed(id) : ''
})
</script>

<template>
  <BottomSheet :open="open" :title="title" :close-label="t('nav.done')" @close="$emit('close')">
    <div v-if="item" class="space-y-3 pb-2">
      <img v-if="kind === 'image'" :src="item.media" alt="" class="w-full rounded-2xl bg-surface-sunk" />
      <video
        v-else-if="kind === 'video'"
        :src="item.media"
        class="w-full rounded-2xl bg-black max-h-[60dvh]"
        controls
        playsinline
        autoplay
      ></video>
      <div v-else-if="kind === 'youtube'" class="relative w-full overflow-hidden rounded-2xl bg-black" style="aspect-ratio: 16 / 9">
        <iframe
          :src="embed"
          class="absolute inset-0 w-full h-full"
          title="Video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
        ></iframe>
      </div>
      <a
        v-if="item.video_url && kind !== 'youtube'"
        :href="item.video_url"
        target="_blank"
        rel="noopener"
        class="btn-outline w-full"
      >
        <Icon name="link" :size="18" /> {{ t('media.openLink', 'Open video link') }}
      </a>
      <a v-else-if="kind === 'youtube'" :href="item.video_url" target="_blank" rel="noopener" class="block text-center text-sm font-medium text-accent-ink py-2">
        {{ t('media.openYoutube', 'Open in YouTube') }}
      </a>
      <p v-if="item.note" class="text-[0.9375rem] text-ink-soft whitespace-pre-line selectable" dir="auto">{{ item.note }}</p>
      <slot />
    </div>
  </BottomSheet>
</template>
