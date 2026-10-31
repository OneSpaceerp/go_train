import { onActivated } from 'vue'

// Tab roots are kept alive (App.vue), so returning to a tab shows it instantly
// with its previous state. Refresh its data quietly at that moment, the way a
// native app re-syncs a tab when it reappears. Not called on first mount.
export function onScreenReturn(refresh) {
  let first = true
  onActivated(() => {
    if (first) {
      first = false
      return
    }
    refresh?.()
  })
}
