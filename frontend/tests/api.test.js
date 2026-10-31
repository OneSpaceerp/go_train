import { describe, it, expect, beforeEach, vi } from 'vitest'

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function loadApi() {
  vi.resetModules()
  return import('../src/lib/api.js')
}

describe('api layer', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('serves cached data only when the network is unreachable', async () => {
    const { api } = await loadApi()
    localStorage.setItem('gt-cache:v2:/insights', JSON.stringify({ ts: 1, data: { done: 3 } }))

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.get('/insights')).resolves.toEqual({ done: 3 })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(500, { exception: 'boom' }))
    await expect(api.get('/insights')).rejects.toThrow('boom')
  })

  it('surfaces Frappe _server_messages as a readable error', async () => {
    const { api } = await loadApi()
    const msgs = JSON.stringify([JSON.stringify({ message: 'This class session is already at full capacity.' })])
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(417, { _server_messages: msgs }))
    await expect(api.post('/classes/CS-1/book')).rejects.toThrow('already at full capacity')
  })

  it('queues loggable mutations with a device timestamp and op id when offline', async () => {
    const { api } = await loadApi()
    const { pendingSyncCount } = await import('../src/lib/pwa.js')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const res = await api.post('/checkin', {})
    expect(res).toEqual({ ok: true, queued: true })
    const [item] = JSON.parse(localStorage.getItem('gt-offline-queue:v1'))
    expect(item.body.client_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(item.id).toBe(item.body.client_op_id)
    expect(pendingSyncCount.value).toBe(1)
  })

  it('does not queue mutations rejected by the server', async () => {
    const { api } = await loadApi()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(417, { exception: 'Invalid workout status' }))
    await expect(api.post('/workouts/WO-1/log', { status: 'done' })).rejects.toThrow('Invalid workout status')
    expect(localStorage.getItem('gt-offline-queue:v1')).toBeNull()
  })

  it('uses the CSRF token from the latest boot response', async () => {
    const { api, csrfToken } = await loadApi()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json(200, { message: { csrf_token: 'fresh-token', user: 'a@b.c' } }),
    )
    await api.get('/auth/me')
    expect(csrfToken()).toBe('fresh-token')
  })
})
