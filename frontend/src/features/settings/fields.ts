import type { EditableSettingKey, EditableSettings } from '@/types/settings'

export type FieldKind = 'provider' | 'int' | 'list' | 'text' | 'duration' | 'select'

export interface FieldDef {
  key: EditableSettingKey
  label: string
  description: string
  kind: FieldKind
  /** Environment variable that provides the default */
  env: string
  /** Choices for kind 'select' */
  options?: { value: string; label: string }[]
}

/** Editable settings in display order, grouped by section title. */
export const FIELD_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Generated accounts',
    fields: [
      {
        key: 'defaultProvider',
        label: 'Default provider',
        kind: 'provider',
        env: 'MAIL_PROVIDER',
        description: 'Preselected in the Generate dialog',
      },
      {
        key: 'usernameFirstNames',
        label: 'First names',
        kind: 'list',
        env: 'USERNAME_FIRST_NAMES',
        description: 'Comma-separated name pool; empty uses the built-in Indonesian names',
      },
      {
        key: 'usernameLastNames',
        label: 'Last names',
        kind: 'list',
        env: 'USERNAME_LAST_NAMES',
        description: 'Comma-separated name pool; empty uses the built-in Indonesian names',
      },
      {
        key: 'usernameMaxAttempts',
        label: 'Address retries',
        kind: 'int',
        env: 'USERNAME_MAX_ATTEMPTS',
        description: 'New addresses tried when one is already taken',
      },
      {
        key: 'bulkGenerateMax',
        label: 'Bulk generate limit',
        kind: 'int',
        env: 'BULK_GENERATE_MAX',
        description: 'Most accounts one "How many" request may create',
      },
      {
        key: 'legacyUsernamePattern',
        label: 'Old-format pattern',
        kind: 'text',
        env: 'LEGACY_USERNAME_PATTERN',
        description:
          'Regular expression on the part before @; matching accounts get an "Old format" badge. Empty disables it',
      },
      {
        key: 'tagMaxLength',
        label: 'Tag max length',
        kind: 'int',
        env: 'TAG_MAX_LENGTH',
        description: 'Characters',
      },
      {
        key: 'noteMaxLength',
        label: 'Note max length',
        kind: 'int',
        env: 'NOTE_MAX_LENGTH',
        description: 'Characters',
      },
    ],
  },
  {
    title: 'Inbox',
    fields: [
      {
        key: 'inboxSyncInterval',
        label: 'Sync interval',
        kind: 'duration',
        env: 'INBOX_SYNC_INTERVAL',
        description: 'How often message counts are refreshed, e.g. 2m or 30s. 0s disables',
      },
      {
        key: 'mailtmRequestDelay',
        label: 'Mail.tm request delay',
        kind: 'duration',
        env: 'MAILTM_REQUEST_DELAY',
        description: 'Pause between Mail.tm accounts during sync (rate limit ~8 requests/s)',
      },
      {
        key: 'inboxSearchMaxPages',
        label: 'Search depth',
        kind: 'int',
        env: 'INBOX_SEARCH_MAX_PAGES',
        description: 'Pages of 30 messages an inbox search covers',
      },
      {
        key: 'messageRetention',
        label: 'Message retention',
        kind: 'duration',
        env: 'MESSAGE_RETENTION',
        description: 'Own-domain messages older than this are deleted, e.g. 720h (30 days). 0s keeps them',
      },
    ],
  },
  {
    title: 'Account lifecycle',
    fields: [
      {
        key: 'autoMarkUsed',
        label: 'Mark as used automatically',
        kind: 'select',
        env: 'AUTO_MARK_USED',
        description: 'Moves an Available account to Used so it is not picked again',
        options: [
          { value: 'off', label: 'Never' },
          { value: 'first_message', label: 'When the first email arrives' },
          { value: 'otp_copied', label: 'When an OTP or link is copied' },
        ],
      },
      {
        key: 'accountCleanupAfter',
        label: 'Clean up inactive after',
        kind: 'duration',
        env: 'ACCOUNT_CLEANUP_AFTER',
        description: 'Accounts without mail for this long are cleaned up, e.g. 720h. 0s disables it',
      },
      {
        key: 'accountCleanupAction',
        label: 'Cleanup action',
        kind: 'select',
        env: 'ACCOUNT_CLEANUP_ACTION',
        description: 'What happens to inactive accounts',
        options: [
          { value: 'block', label: 'Mark as Blocked (keeps the inbox)' },
          { value: 'delete', label: 'Delete with its messages' },
        ],
      },
    ],
  },
]

/** Form text for a setting value (lists become comma-separated). */
export function toDraft(value: EditableSettings[EditableSettingKey]): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

/** API value for a form text, or an error message. */
export function fromDraft(kind: FieldKind, draft: string): { value: unknown } | { error: string } {
  const text = draft.trim()
  switch (kind) {
    case 'int': {
      const n = Number(text)
      return Number.isInteger(n) && n > 0 ? { value: n } : { error: 'Enter a whole number greater than 0' }
    }
    case 'list':
      return {
        value: text
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      }
    case 'duration':
      return /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(text) || text === '0'
        ? { value: text }
        : { error: 'Use a duration such as 30s, 2m or 720h' }
    default:
      return { value: text }
  }
}

/** True when the draft means something different from the saved value. */
export function isChanged(
  kind: FieldKind,
  draft: string,
  saved: EditableSettings[EditableSettingKey],
): boolean {
  const parsed = fromDraft(kind, draft)
  if ('error' in parsed) return true
  return JSON.stringify(parsed.value) !== JSON.stringify(kind === 'duration' ? String(saved) : saved)
}
