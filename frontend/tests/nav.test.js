import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { session } from '../src/lib/session.js'
import {
  goTab,
  resolveNavigation,
  commitNavigation,
  adjacentTab,
  currentTab,
  registerTitle,
  titleForPath,
  _resetNav,
} from '../src/lib/nav.js'

const route = (fullPath, meta = {}) => ({ fullPath, path: fullPath.split('?')[0], meta, matched: [{}] })

function fakeRouter(start) {
  const currentRoute = ref(start)
  return {
    currentRoute,
    push: vi.fn((path) => {
      currentRoute.value = route(path)
      return Promise.resolve()
    }),
  }
}

// Simulate a committed navigation the way router.js does
function navigate(to, from) {
  const info = resolveNavigation(to, from, 0)
  commitNavigation(to, info)
  return info
}

describe('native tab navigation', () => {
  beforeEach(() => {
    _resetNav()
    session.user = { role: 'client' }
    window.scrollTo = vi.fn()
  })

  it('keeps a separate stack per tab and returns to where you left it', () => {
    navigate(route('/', { tab: 'train' }), route('/', { tab: 'train' }))
    navigate(route('/workouts/WO-1'), route('/', { tab: 'train' }))
    expect(currentTab.value).toBe('train')

    const router = fakeRouter(route('/workouts/WO-1'))
    expect(goTab(router, 'messages')).toBe('switch')
    expect(router.push).toHaveBeenLastCalledWith('/messages')
    navigate(route('/messages', { tab: 'messages' }), route('/workouts/WO-1'))

    goTab(router, 'train')
    expect(router.push).toHaveBeenLastCalledWith('/workouts/WO-1')
  })

  it('pops to the root when the active tab is tapped deeper in its stack', () => {
    navigate(route('/', { tab: 'train' }), route('/', { tab: 'train' }))
    navigate(route('/history'), route('/', { tab: 'train' }))
    const router = fakeRouter(route('/history'))
    expect(goTab(router, 'train')).toBe('pop-to-root')
    expect(router.push).toHaveBeenLastCalledWith('/')
    const info = resolveNavigation(route('/', { tab: 'train' }), route('/history'), 0)
    expect(info.direction).toBe('backward')
  })

  it('scrolls to top when the active tab is tapped at its root', () => {
    navigate(route('/track', { tab: 'track' }), route('/', { tab: 'train' }))
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true })
    expect(goTab(fakeRouter(route('/track', { tab: 'track' })), 'track')).toBe('scroll-top')
    expect(window.scrollTo).toHaveBeenCalled()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('classifies directions: push inherits the tab, tab switch, same screen', () => {
    navigate(route('/profile', { tab: 'profile' }), route('/', { tab: 'train' }))
    const push = resolveNavigation(route('/marketplace'), route('/profile', { tab: 'profile' }), 0)
    expect(push).toEqual({ tab: 'profile', direction: 'forward' })

    const tabSwitch = resolveNavigation(route('/track', { tab: 'track' }), route('/profile', { tab: 'profile' }), 0)
    expect(tabSwitch.direction).toBe('tab')

    const same = resolveNavigation(route('/profile', { tab: 'profile' }), route('/profile', { tab: 'profile' }), 0)
    expect(same.direction).toBe('none')
  })

  it('honours an explicit swipe direction and finds neighbouring tabs', () => {
    navigate(route('/classes', { tab: 'classes' }), route('/', { tab: 'train' }))
    expect(adjacentTab(1).tab).toBe('track')
    expect(adjacentTab(-1).tab).toBe('train')

    const router = fakeRouter(route('/classes', { tab: 'classes' }))
    goTab(router, 'track', { direction: 'swipe-left' })
    const info = resolveNavigation(route('/track', { tab: 'track' }), route('/classes', { tab: 'classes' }), 0)
    expect(info).toEqual({ tab: 'track', direction: 'swipe-left' })
  })

  it('uses coach tabs for coaches', () => {
    session.user = { role: 'coach' }
    navigate(route('/coach', { tab: 'clients' }), route('/', { tab: 'train' }))
    expect(adjacentTab(1).tab).toBe('programs')
    expect(adjacentTab(-1)).toBeNull()
  })

  it('remembers screen titles for back-button labels', () => {
    registerTitle('/history', 'History')
    expect(titleForPath('/history')).toBe('History')
    expect(titleForPath('/unknown')).toBe('')
  })
})
