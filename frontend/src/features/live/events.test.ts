import { describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { invalidateForEvent, parseLiveEvent, summarizeNewMail } from './events'

describe('parseLiveEvent', () => {
  it('accepts known event types', () => {
    expect(parseLiveEvent('{"type":"message.created","accountId":"a1","subject":"OTP"}')).toEqual({
      type: 'message.created',
      accountId: 'a1',
      subject: 'OTP',
    })
  })

  it('rejects malformed or unknown payloads', () => {
    expect(parseLiveEvent('not json')).toBeNull()
    expect(parseLiveEvent('{"type":"something.else"}')).toBeNull()
  })
})

describe('invalidateForEvent', () => {
  const client = () =>
    ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & {
      invalidateQueries: ReturnType<typeof vi.fn>
    }

  it('refreshes the inbox and accounts on new mail', () => {
    const queryClient = client()
    invalidateForEvent(queryClient, { type: 'message.created', accountId: 'a1' })
    const keys = queryClient.invalidateQueries.mock.calls.map(([arg]) => arg.queryKey)
    expect(keys).toEqual([['messages', 'a1'], ['accounts']])
  })

  it('refreshes settings on settings changes', () => {
    const queryClient = client()
    invalidateForEvent(queryClient, { type: 'settings.changed' })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['settings'] })
  })
})

describe('summarizeNewMail', () => {
  const mail = (accountId: string, subject = 'Hi') =>
    ({ type: 'message.created', accountId, accountEmail: `${accountId}@re-testing.me`, subject }) as const

  it('describes a single email', () => {
    expect(summarizeNewMail([mail('a', 'OTP')])).toEqual({
      title: 'New email for a@re-testing.me',
      description: 'OTP',
      accountId: 'a',
    })
  })

  it('groups several emails for one account and keeps its inbox link', () => {
    expect(summarizeNewMail([mail('a'), mail('a'), mail('a')])).toEqual({
      title: '3 new emails',
      description: 'For a@re-testing.me',
      accountId: 'a',
    })
  })

  it('groups emails for many accounts without a single inbox link', () => {
    expect(summarizeNewMail([mail('a'), mail('b'), mail('c'), mail('d')])).toEqual({
      title: '4 new emails',
      description: 'For a@re-testing.me, b@re-testing.me and 2 more',
      accountId: undefined,
    })
  })
})
