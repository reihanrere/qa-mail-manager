import { isAxiosError } from 'axios'
import i18n from '@/i18n'

interface ErrorEnvelope {
  message?: string
  code?: string
  params?: Record<string, unknown>
}

// Codes whose English message carries the useful detail (e.g. what Mail.tm answered)
const GENERIC_CODES = new Set(['upstream_error', 'internal_error'])

// Keys are built at runtime from the backend's code, so they bypass the typed `t`
const translate = (key: string, options?: Record<string, unknown>): string =>
  (i18n.t as (key: string, options?: Record<string, unknown>) => string)(key, options)

/**
 * User-facing text for a failed request. A known backend `code` is translated with its
 * `params`; server failures show `fallback` plus the backend's (English) detail.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<ErrorEnvelope>(error)) return fallback
  if (!error.response) return i18n.t('errors.network')

  const { code, message, params = {} } = error.response.data ?? {}
  if (code && !GENERIC_CODES.has(code) && i18n.exists(`errors.${code}`)) {
    return translate(`errors.${code}`, {
      ...params,
      field: typeof params.field === 'string' ? translate(`errors.fields.${params.field}`) : params.field,
      key: typeof params.key === 'string' ? settingLabel(params.key) : params.key,
    })
  }
  return message ? `${fallback}: ${message}` : fallback
}

function settingLabel(key: string): string {
  const path = `settingsFields.${key}.label`
  return i18n.exists(path) ? translate(path) : key
}
