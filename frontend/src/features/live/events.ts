import type { QueryClient } from '@tanstack/react-query'
import { accountKeys } from '@/features/account/queries'
import { messageKeys } from '@/features/inbox/queries'
import { settingsKeys } from '@/features/settings/queries'

/** Payload of an event from `GET /api/events` (mirrors services.Event). */
export interface LiveEvent {
  type: 'message.created' | 'accounts.changed' | 'settings.changed'
  accountId?: string
  accountEmail?: string
  subject?: string
}

export const LIVE_EVENT_TYPES: LiveEvent['type'][] = [
  'message.created',
  'accounts.changed',
  'settings.changed',
]

/** Refreshes the cached data an event makes stale. */
export function invalidateForEvent(queryClient: QueryClient, event: LiveEvent) {
  switch (event.type) {
    case 'message.created':
      queryClient.invalidateQueries({ queryKey: messageKeys.all(event.accountId) })
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      break
    case 'accounts.changed':
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      break
    case 'settings.changed':
      queryClient.invalidateQueries({ queryKey: settingsKeys.all })
      break
  }
}

/** Text of one grouped toast for several new emails that arrived together. */
export function summarizeNewMail(events: LiveEvent[]): {
  title: string
  description: string
  accountId?: string
} {
  const accounts = [...new Set(events.map((e) => e.accountEmail ?? 'an account'))]
  if (events.length === 1) {
    return {
      title: `New email for ${accounts[0]}`,
      description: events[0].subject || '(No subject)',
      accountId: events[0].accountId,
    }
  }
  const shown = accounts.slice(0, 2).join(', ')
  const more = accounts.length > 2 ? ` and ${accounts.length - 2} more` : ''
  return {
    title: `${events.length} new emails`,
    description: `For ${shown}${more}`,
    // Open the inbox of the account only when all mail went to one account
    accountId: accounts.length === 1 ? events[0].accountId : undefined,
  }
}

/** Parses an SSE data field, or null for malformed payloads. */
export function parseLiveEvent(data: string): LiveEvent | null {
  try {
    const event = JSON.parse(data) as LiveEvent
    return LIVE_EVENT_TYPES.includes(event.type) ? event : null
  } catch {
    return null
  }
}
