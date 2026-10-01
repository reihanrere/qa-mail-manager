import type { EditableSettingKey, EditableSettings } from '@/types/settings'

export type FieldKind = 'provider' | 'int' | 'list' | 'text' | 'duration' | 'select'

export interface FieldDef {
  key: EditableSettingKey
  kind: FieldKind
  /** Environment variable that provides the default */
  env: string
  /** Choices for kind 'select'; labels are `settingsOptions.<key>.<value>` translations */
  options?: string[]
}

/** Section of the form; its title is the `settingsGroups.<id>` translation. */
export interface FieldGroup {
  id: 'accounts' | 'inbox' | 'lifecycle'
  fields: FieldDef[]
}

/**
 * Editable settings in display order. Labels and descriptions are the
 * `settingsFields.<key>` translations.
 */
export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: 'accounts',
    fields: [
      { key: 'defaultProvider', kind: 'provider', env: 'MAIL_PROVIDER' },
      { key: 'usernameFirstNames', kind: 'list', env: 'USERNAME_FIRST_NAMES' },
      { key: 'usernameLastNames', kind: 'list', env: 'USERNAME_LAST_NAMES' },
      { key: 'usernameMaxAttempts', kind: 'int', env: 'USERNAME_MAX_ATTEMPTS' },
      { key: 'bulkGenerateMax', kind: 'int', env: 'BULK_GENERATE_MAX' },
      { key: 'legacyUsernamePattern', kind: 'text', env: 'LEGACY_USERNAME_PATTERN' },
      { key: 'tagMaxLength', kind: 'int', env: 'TAG_MAX_LENGTH' },
      { key: 'noteMaxLength', kind: 'int', env: 'NOTE_MAX_LENGTH' },
    ],
  },
  {
    id: 'inbox',
    fields: [
      { key: 'inboxSyncInterval', kind: 'duration', env: 'INBOX_SYNC_INTERVAL' },
      { key: 'mailtmRequestDelay', kind: 'duration', env: 'MAILTM_REQUEST_DELAY' },
      { key: 'inboxSearchMaxPages', kind: 'int', env: 'INBOX_SEARCH_MAX_PAGES' },
      { key: 'messageRetention', kind: 'duration', env: 'MESSAGE_RETENTION' },
    ],
  },
  {
    id: 'lifecycle',
    fields: [
      {
        key: 'autoMarkUsed',
        kind: 'select',
        env: 'AUTO_MARK_USED',
        options: ['off', 'first_message', 'otp_copied'],
      },
      { key: 'accountCleanupAfter', kind: 'duration', env: 'ACCOUNT_CLEANUP_AFTER' },
      {
        key: 'accountCleanupAction',
        kind: 'select',
        env: 'ACCOUNT_CLEANUP_ACTION',
        options: ['block', 'delete'],
      },
    ],
  },
]

/** Why a draft cannot be saved; the text is the `settingsForm.errors.<code>` translation. */
export type DraftError = 'positiveInt' | 'duration'

/** Form text for a setting value (lists become comma-separated). */
export function toDraft(value: EditableSettings[EditableSettingKey]): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

/** API value for a form text, or why it is invalid. */
export function fromDraft(kind: FieldKind, draft: string): { value: unknown } | { error: DraftError } {
  const text = draft.trim()
  switch (kind) {
    case 'int': {
      const n = Number(text)
      return Number.isInteger(n) && n > 0 ? { value: n } : { error: 'positiveInt' }
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
        : { error: 'duration' }
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
