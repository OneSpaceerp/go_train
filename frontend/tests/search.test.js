import { describe, it, expect } from 'vitest'
import { highlight, snippet } from '../src/lib/search.js'

describe('highlight', () => {
  it('escapes HTML so v-html cannot inject markup', () => {
    expect(highlight('<img src=x onerror=alert(1)>', '')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(highlight('<b>Back Squat</b>', 'squat')).toBe('&lt;b&gt;Back <mark>Squat</mark>&lt;/b&gt;')
  })

  it('matches Arabic letter variants and Arabic-Indic digits', () => {
    expect(highlight('أحمد ٥ كجم', 'احمد 5')).toBe('<mark>أحمد</mark> <mark>٥</mark> كجم')
  })
})

describe('snippet', () => {
  it('returns the line containing the match', () => {
    expect(snippet({ result: 'warmup\n5x5 @ 100kg', body: '' }, '100kg').text).toBe('5x5 @ 100kg')
  })
})
