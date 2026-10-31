import { describe, it, expect } from 'vitest'
import { sharedText, protocolPath } from '../src/lib/launch.js'

describe('sharedText', () => {
  it('joins title, text and url without repeating the link', () => {
    const url = 'https://youtu.be/abc12345678'
    expect(sharedText({ title: 'Squat cues', text: `Watch this ${url}`, url })).toBe(`Squat cues\nWatch this ${url}`)
  })
  it('is empty when nothing was shared', () => {
    expect(sharedText({})).toBe('')
  })
})

describe('protocolPath', () => {
  it('maps web+gotrain links to app screens', () => {
    expect(protocolPath('web+gotrain://workouts/WO-1')).toBe('/workouts/WO-1')
    expect(protocolPath('web%2Bgotrain%3A%2F%2Ftrack')).toBe('/')
    expect(protocolPath('web+gotrain:classes/')).toBe('/classes')
  })
  it('falls back to Today for unknown or unsafe paths', () => {
    expect(protocolPath('web+gotrain://desk/user')).toBe('/')
    expect(protocolPath('web+gotrain://%2F%2Fevil.com')).toBe('/')
    expect(protocolPath('')).toBe('/')
  })
})
