import { describe, it, expect, beforeEach, vi } from 'vitest'

// pwa.js reads localStorage at import time, so import it fresh per test
async function loadPwa() {
  vi.resetModules()
  return import('../src/lib/pwa.js')
}

const err = (status, extra = {}) => Object.assign(new Error(`HTTP ${status}`), { status, ...extra })

describe('offline queue', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('replays queued items in order and empties the queue', async () => {
    const pwa = await loadPwa()
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/a', body: { client_op_id: 'op-1' } })
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/b', body: { client_op_id: 'op-2' } })
    const seen = []
    await pwa.flushOfflineQueue(async (item) => seen.push(item.id))
    expect(seen).toEqual(['op-1', 'op-2'])
    expect(pwa.pendingSyncCount.value).toBe(0)
  })

  it('stops on a transient failure and keeps the rest for later', async () => {
    const pwa = await loadPwa()
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/a', body: {} })
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/b', body: {} })
    const runner = vi.fn().mockRejectedValue(err(0, { network: true }))
    await pwa.flushOfflineQueue(runner)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(pwa.pendingSyncCount.value).toBe(2)
    expect(pwa.syncFailures.value).toEqual([])
  })

  it('moves a rejected item to failures instead of dropping it, and continues', async () => {
    const pwa = await loadPwa()
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/bad', body: {} })
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/good', body: {} })
    const ran = []
    await pwa.flushOfflineQueue(async (item) => {
      ran.push(item.path)
      if (item.path === '/bad') throw err(417)
    })
    expect(ran).toEqual(['/bad', '/good'])
    expect(pwa.pendingSyncCount.value).toBe(0)
    expect(pwa.syncFailures.value.map((f) => f.path)).toEqual(['/bad'])
    pwa.dismissSyncFailures()
    expect(pwa.syncFailures.value).toEqual([])
  })

  it('shares one run between concurrent flushes', async () => {
    const pwa = await loadPwa()
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/a', body: {} })
    const runner = vi.fn(async () => {})
    await Promise.all([pwa.flushOfflineQueue(runner), pwa.flushOfflineQueue(runner)])
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('purges per-user data on logout', async () => {
    const pwa = await loadPwa()
    pwa.writeCache('/programs', [{ id: 1 }])
    pwa.enqueueOfflineMutation({ method: 'POST', path: '/a', body: {} })
    await pwa.purgeAllCachesOnLogout()
    expect(pwa.readCache('/programs')).toBeNull()
    expect(pwa.pendingSyncCount.value).toBe(0)
  })
})
