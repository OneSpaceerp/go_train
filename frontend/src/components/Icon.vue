<script setup>
// Small inline-SVG icon set (stroke icons). Keeps the bundle free of an icon lib.
const P = {
  train: 'M2 10h2V8h2v8H4v-2H2zM6 7h3v10H6zM9 11h6v2H9zM15 7h3v10h-3zM18 8h2v2h2v4h-2v2h-2z',
  track: 'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-9',
  message: 'M4 5h16v11H9l-5 4z',
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
  share: 'M18 8a3 3 0 1 0-3-3M6 15a3 3 0 1 0 0-.1M18 19a3 3 0 1 0 0-.1M8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
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
}
const props = defineProps({ name: String, size: { type: [Number, String], default: 22 } })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="P[name]" />
  </svg>
</template>
