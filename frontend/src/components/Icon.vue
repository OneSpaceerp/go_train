<script setup>
// Crisp 24x24 inline stroke SVG icon set. Directional icons automatically mirror in RTL.
import { computed } from 'vue'

const P = {
  train: 'M2 10h2V8h2v8H4v-2H2zM6 7h3v10H6zM9 11h6v2H9zM15 7h3v10h-3zM18 8h2v2h2v4h-2v2h-2z',
  track: 'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-9',
  message: 'M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
  clients: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20a7 7 0 0 1 13 0M16 4a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7',
  programs: 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M9.5 19a2.5 2.5 0 0 0 5 0',
  chevron: 'm9 6 6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  check: 'm5 12 5 5 9-10',
  x: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  timer: 'M10 2h4M12 9v4l2 2M12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
  // Share sheet: arrow up out of a tray (the iOS / Material "share" glyph)
  share: 'M12 15V3M8 7l4-4 4 4M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1',
  // Check in at the gym: arrow entering a door
  checkin: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M3 12h11M10 8l4 4-4 4',
  send: 'M4 12l16-8-6 16-3-6z',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  dumbbell: 'M2 10h2V8h2v8H4v-2H2zM6 7h3v10H6zM9 11h6v2H9zM15 7h3v10h-3zM18 8h2v2h2v4h-2v2h-2z',
  store: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M15 20a6 6 0 0 1 6-6',
  tag: 'M3 12l8-8h8v8l-8 8zM15.5 7.5h.01',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
  lock: 'M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5zM12 14v3',
  flame: 'M12 3c2 3.5 5 6 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4.5 2.5-6 1 1.5 1.5 2.5 1.5 2.5S11.5 6 12 3Z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM4 5h3v4a3 3 0 0 1-3-3V5ZM17 5h3v1a3 3 0 0 1-3 3V5Z',
  sparkles: 'm12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3ZM5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9L5 17ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  wifiOff: 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.8a10 10 0 0 1 5.2-2.7M19 12.8a10 10 0 0 0-3-2M2 8.8a15 15 0 0 1 4.1-2.8M22 8.8A15 15 0 0 0 10.6 5M12 20h.01',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5',
  play: 'm7 5 12 7-12 7V5Z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM17 17h3v3h-3zM14 20h3',
  more: 'M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM19 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  paperclip: 'M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  minus: 'M5 12h14',
}

const DIRECTIONAL = new Set(['back', 'chevron', 'send', 'logout'])

const props = defineProps({
  name: String,
  size: { type: [Number, String], default: 22 },
  // Selected state (e.g. the active tab): tint the glyph's closed shapes
  filled: { type: Boolean, default: false },
})

const isDirectional = computed(() => DIRECTIONAL.has(props.name))
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    :fill-opacity="filled ? 0.2 : undefined"
    stroke="currentColor"
    :stroke-width="filled ? 2.2 : 2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="isDirectional ? 'icon-flip' : ''"
    aria-hidden="true"
  >
    <path :d="P[name]" />
  </svg>
</template>
