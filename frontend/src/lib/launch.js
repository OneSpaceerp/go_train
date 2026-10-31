// Ways the OS can open the app with something to send: the share sheet
// (manifest share_target, POST stashed by sw-custom.js), "Open with Go Train"
// on photos and videos (file_handlers + launchQueue), and web+gotrain: links
// (protocol_handlers). Shared content waits in `inbox` until the athlete picks
// a conversation on the Messages tab.
import { reactive } from 'vue'

export const SHARE_CACHE = 'gotrain-share-inbox'
export const MAX_SHARED_FILES = 5

export const inbox = reactive({ text: '', files: [] })

export function hasShare() {
  return Boolean(inbox.text || inbox.files.length)
}

export function clearInbox() {
  inbox.text = ''
  inbox.files = []
}

// title/text/url from the share sheet, without repeats (apps often put the
// link in both `text` and `url`)
export function sharedText({ title, text, url } = {}) {
  const parts = []
  for (const value of [title, text, url]) {
    const v = String(value || '').trim()
    if (v && !parts.some((p) => p.includes(v))) parts.push(v)
  }
  return parts.join('\n')
}

const APP_PATH =
  /^\/(classes|track|messages|profile|history|programs|workouts|threads|notifications|exercises|marketplace|gym|promos|coach)(\/[\w.-]+)*$/

// web+gotrain://workouts/WO-1 → /workouts/WO-1; anything unknown opens Today
export function protocolPath(link) {
  let path = String(link || '')
    .replace(/^web\+gotrain:\/*/i, '/')
    .split(/[?#]/)[0]
  try {
    path = decodeURIComponent(path)
  } catch {
    return '/'
  }
  path = path.replace(/\/+$/, '') || '/'
  return path === '/' || APP_PATH.test(path) ? path : '/'
}

// Files the service worker saved from a share-sheet POST
export async function takeSharedFiles() {
  if (typeof caches === 'undefined') return []
  try {
    const cache = await caches.open(SHARE_CACHE)
    const files = []
    for (const request of await cache.keys()) {
      const response = await cache.match(request)
      if (response) {
        const name = decodeURIComponent(response.headers.get('x-file-name') || 'shared')
        files.push(new File([await response.blob()], name, { type: response.headers.get('content-type') || '' }))
      }
      await cache.delete(request)
    }
    return files.slice(0, MAX_SHARED_FILES)
  } catch {
    return []
  }
}

export function initFileLaunch(router) {
  if (typeof window === 'undefined' || !('launchQueue' in window)) return
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files?.length) return
    const files = await Promise.all(params.files.slice(0, MAX_SHARED_FILES).map((handle) => handle.getFile()))
    inbox.text = ''
    inbox.files = files
    router.push({ path: '/messages', query: { share: '1' } })
  })
}
