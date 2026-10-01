import { describe, expect, it } from 'vitest'
import { initialProvider } from './provider'
import type { AppSettings, EditableSettings, ProviderStatus } from '@/types/settings'

const settings = (
  defaultProvider: AppSettings['defaultProvider'],
  providers: ProviderStatus[],
): AppSettings => ({
  defaultProvider,
  providers,
  limits: { tagMaxLength: 50, noteMaxLength: 500 },
  inbox: {
    syncInterval: '2m0s',
    searchMaxPages: 10,
    messageRetention: 'disabled',
    ingestEnabled: false,
    sendingEnabled: false,
  },
  editable: editable(defaultProvider),
  defaults: editable(defaultProvider),
  overridden: [],
})

const editable = (defaultProvider: AppSettings['defaultProvider']): EditableSettings => ({
  defaultProvider,
  tagMaxLength: 50,
  noteMaxLength: 500,
  usernameMaxAttempts: 5,
  bulkGenerateMax: 50,
  usernameFirstNames: [],
  usernameLastNames: [],
  legacyUsernamePattern: '^qa_test_',
  inboxSearchMaxPages: 10,
  inboxSyncInterval: '2m0s',
  mailtmRequestDelay: '400ms',
  messageRetention: '720h0m0s',
  autoMarkUsed: 'off',
  accountCleanupAfter: '0s',
  accountCleanupAction: 'block',
})

const local: ProviderStatus = { name: 'local', label: 'Own domain', domain: 're-testing.me', available: true }
const mailtm: ProviderStatus = { name: 'mailtm', label: 'Mail.tm', domain: 'uberip.com', available: true }

describe('initialProvider', () => {
  it('is undefined while settings load', () => {
    expect(initialProvider(undefined)).toBeUndefined()
  })

  it('uses the server default when it is available', () => {
    expect(initialProvider(settings('mailtm', [local, mailtm]))).toBe('mailtm')
  })

  it('falls back to the first available provider when the default is down', () => {
    expect(initialProvider(settings('local', [{ ...local, available: false }, mailtm]))).toBe('mailtm')
  })

  it('is undefined when nothing is available', () => {
    expect(initialProvider(settings('local', [{ ...local, available: false }]))).toBeUndefined()
  })
})
