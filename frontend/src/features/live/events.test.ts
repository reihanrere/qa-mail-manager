import { describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { invalidateForEvent, parseLiveEvent } from './events'

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
