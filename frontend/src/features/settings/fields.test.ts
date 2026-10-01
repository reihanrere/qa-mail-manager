import { describe, expect, it } from 'vitest'
import { fromDraft, isChanged, toDraft } from './fields'

describe('toDraft', () => {
  it('joins lists with commas', () => {
    expect(toDraft(['budi', 'sari'])).toBe('budi, sari')
    expect(toDraft(50)).toBe('50')
  })
})

describe('fromDraft', () => {
  it.each([
    ['int', '25', { value: 25 }],
    ['int', '0', { error: 'positiveInt' }],
    ['int', '2.5', { error: 'positiveInt' }],
    ['list', ' budi , ,sari ', { value: ['budi', 'sari'] }],
    ['list', '', { value: [] }],
    ['duration', '720h', { value: '720h' }],
    ['duration', '1h30m', { value: '1h30m' }],
    ['duration', '0s', { value: '0s' }],
    ['duration', 'soon', { error: 'duration' }],
    ['text', ' ^qa_test_ ', { value: '^qa_test_' }],
  ] as const)('%s %j', (kind, draft, expected) => {
    expect(fromDraft(kind, draft)).toEqual(expected)
  })
})

describe('isChanged', () => {
  it('ignores formatting-only differences', () => {
    expect(isChanged('list', 'budi,sari', ['budi', 'sari'])).toBe(false)
    expect(isChanged('int', ' 50 ', 50)).toBe(false)
    expect(isChanged('duration', '2m0s', '2m0s')).toBe(false)
  })

  it('detects edits and invalid drafts', () => {
    expect(isChanged('int', '51', 50)).toBe(true)
    expect(isChanged('int', 'abc', 50)).toBe(true)
    expect(isChanged('list', 'budi', ['budi', 'sari'])).toBe(true)
  })
})
