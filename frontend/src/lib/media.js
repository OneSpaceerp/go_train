// Media helpers for movement demos and form checks: uploaded photos/videos
// (Frappe file URLs) and video links (YouTube or any web page).

const IMAGE = /\.(png|jpe?g|gif|webp|heic|heif|avif)(\?|$)/i
const VIDEO = /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i

export const isImageUrl = (url) => IMAGE.test(url || '')
export const isVideoUrl = (url) => VIDEO.test(url || '')

/** YouTube video id from watch, youtu.be, shorts, embed or live links. */
export function youtubeId(url) {
  if (!url) return null
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/)
      if (m) return m[2]
    }
  } catch {}
  return null
}

export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const youtubeEmbed = (id) =>
  `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&autoplay=1`

/** Accepts "youtu.be/x" style input; returns a full https URL or '' if invalid. */
export function normalizeVideoLink(input) {
  const text = String(input || '').trim()
  if (!text) return ''
  try {
    const u = new URL(text.includes('://') ? text : `https://${text}`)
    return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.') ? u.href : ''
  } catch {
    return ''
  }
}

/** What a {media, video_url} pair shows: 'image' | 'video' | 'youtube' | 'link' | null */
export function mediaKind(item) {
  if (item?.media) return isVideoUrl(item.media) ? 'video' : isImageUrl(item.media) ? 'image' : 'file'
  if (item?.video_url) return youtubeId(item.video_url) ? 'youtube' : 'link'
  return null
}
