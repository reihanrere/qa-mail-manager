import type { ApiResponse } from './api'

/** Mail backend that owns a mailbox: public Mail.tm or our own catch-all domain. */
export type MailProviderName = 'mailtm' | 'local'

/** One provider as reported by `GET /api/settings`. */
export interface ProviderStatus {
  name: MailProviderName
  label: string
  /** First domain, for simple displays; missing when the provider is unavailable */
  domain?: string
  /** Every domain new addresses can be created on */
  domains?: string[]
  available: boolean
  /** Why the provider cannot generate accounts right now */
  error?: string
}

/**
 * Settings the Settings page can change. Durations are Go duration strings ("2m0s", "720h").
 * Saved changes override the environment defaults until reset.
 */
export interface EditableSettings {
  defaultProvider: MailProviderName
  tagMaxLength: number
  noteMaxLength: number
  usernameMaxAttempts: number
  bulkGenerateMax: number
  usernameFirstNames: string[]
  usernameLastNames: string[]
  legacyUsernamePattern: string
  inboxSearchMaxPages: number
  inboxSyncInterval: string
  mailtmRequestDelay: string
  messageRetention: string
  autoMarkUsed: AutoMarkUsed
  accountCleanupAfter: string
  accountCleanupAction: 'block' | 'delete'
}

/** When an AVAILABLE account becomes USED automatically. */
export type AutoMarkUsed = 'off' | 'first_message' | 'otp_copied'

export type EditableSettingKey = keyof EditableSettings

/** Body of `PATCH /api/settings`: `values` sets keys, `reset` restores environment defaults. */
export interface SettingsPatch {
  values?: Partial<EditableSettings>
  reset?: EditableSettingKey[]
}

/** Runtime configuration (`GET /api/settings`). */
export interface AppSettings {
  defaultProvider: MailProviderName
  providers: ProviderStatus[]
  limits: {
    tagMaxLength: number
    noteMaxLength: number
  }
  inbox: {
    /** Go duration such as "2m0s", or "disabled" */
    syncInterval: string
    searchMaxPages: number
    messageRetention: string
    ingestEnabled: boolean
    /** SMTP is configured, so own-domain accounts can reply */
    sendingEnabled: boolean
  }
  /** Current value of every editable setting */
  editable: EditableSettings
  /** Environment values the editable settings fall back to */
  defaults: EditableSettings
  /** Keys changed from the Settings page */
  overridden: EditableSettingKey[]
}

export type AppSettingsResponse = ApiResponse<AppSettings>
