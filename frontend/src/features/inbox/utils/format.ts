import type { MessageAddress } from '@/types/message'

/** Display name of a sender, falling back to the address and then a placeholder. */
export function getSenderName(from: MessageAddress | string | null | undefined): string {
  if (!from) return 'Unknown sender'
  if (typeof from === 'string') return from
  return from.name?.trim() || from.address || 'Unknown sender'
}

/** Sender's email address, or an empty string. */
export function getSenderAddress(from: MessageAddress | string | null | undefined): string {
  if (!from) return ''
  if (typeof from === 'string') return from
  return from.address ?? ''
}

/**
 * Two-letter avatar initials. Emails use the last segment of the local part because generated
 * addresses share the `qa_test_` prefix; names use the first letters of the first two words.
 */
export function getInitials(value: string): string {
  const isEmail = value.includes('@')
  const cleaned = value.split('@')[0].replace(/[^a-zA-Z0-9\s._-]/g, '')
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean)
  if (isEmail) return (parts.at(-1) ?? '?').slice(0, 2).toUpperCase()
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0] ?? '?').slice(0, 2).toUpperCase()
}
