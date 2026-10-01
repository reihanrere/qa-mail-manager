import type { QueryClient } from '@tanstack/react-query'
import i18n from '@/i18n'
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
  const accounts = [...new Set(events.map((e) => e.accountEmail ?? i18n.t('live.anAccount')))]
  if (events.length === 1) {
    return {
      title: i18n.t('live.newEmailFor', { account: accounts[0] }),
      description: events[0].subject || i18n.t('common.noSubject'),
      accountId: events[0].accountId,
    }
  }
  const shown = accounts.slice(0, 2).join(', ')
  return {
    title: i18n.t('live.newEmails', { count: events.length }),
    description:
      accounts.length > 2
        ? i18n.t('live.forAccountsMore', { accounts: shown, count: accounts.length - 2 })
        : i18n.t('live.forAccounts', { accounts: shown }),
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
