import dayjs from 'dayjs'

export const shortDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '')
export const niceDate = (d) => (d ? dayjs(d).format('D MMM YYYY') : '')
export const fromNow = (d) => {
  if (!d) return ''
  const diff = dayjs().diff(dayjs(d), 'day')
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff} days ago`
  return dayjs(d).format('D MMM')
}
export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

export const money = (cents, currency = 'USD') =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format((cents || 0) / 100)

// Notes-style date section for grouped history (Today / Previous 7 Days / month).
export function dateSection(d, today = dayjs()) {
  const date = dayjs(d)
  const diff = today.startOf('day').diff(date.startOf('day'), 'day')
  if (diff <= 0) return 'Today'
  if (diff <= 7) return 'Previous 7 Days'
  if (diff <= 30) return 'Previous 30 Days'
  return date.year() === today.year() ? date.format('MMMM') : date.format('MMMM YYYY')
}
