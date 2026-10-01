import type { ApiResponse, PaginatedResponse } from './api'
import type { MailProviderName } from './settings'

/** Lifecycle of a test account: free to use, already used by a test, or blocked. */
export type AccountStatus = 'AVAILABLE' | 'USED' | 'BLOCKED'

/** A stored test account (the password never leaves the backend). */
export interface MailAccount {
  id: string
  /** Backend that owns the mailbox */
  provider: MailProviderName
  accountId: string
  email: string
  domain: string
  status: AccountStatus
  tag: string
  note: string
  /** Newest inbox message, refreshed by the backend's background inbox sync */
  lastMessageAt: string | null
  messageCount: number
  /** Address matches the old, detectable naming pattern and should be replaced */
  legacyName: boolean
  createdAt: string
  updatedAt: string
}

/** `latest_message` puts accounts with the most recent inbox activity first. */
export type AccountSort = 'newest' | 'latest_message'

/** Query parameters for `GET /api/accounts`. */
export interface ListAccountsParams {
  search?: string
  status?: AccountStatus
  provider?: MailProviderName
  /** Only accounts with a legacy (detectable) address */
  legacy?: boolean
  sort?: AccountSort
  page?: number
  limit?: number
}

/** Response of `GET /api/accounts/stats`. */
export interface AccountStats {
  total: number
  byStatus: Record<AccountStatus, number>
  byDomain: { domain: string; count: number }[]
  /** Accounts and recorded inbox messages per provider */
  byProvider: { provider: MailProviderName; count: number; messages: number }[]
  /** Accounts whose address matches the legacy naming pattern */
  legacy: number
}

/** Response of `POST /api/accounts/:id/replace`. */
export interface ReplaceAccountResult {
  account: MailAccount
  replacedId: string
}

export type AccountsResponse = PaginatedResponse<MailAccount>
export type AccountResponse = ApiResponse<MailAccount>
export type AccountStatsResponse = ApiResponse<AccountStats>

/** Optional labels and provider for `POST /api/accounts/generate`; limits come from `GET /api/settings`. */
export interface GenerateAccountRequest {
  tag?: string
  note?: string
  /** Omit to use the server default */
  provider?: MailProviderName
}

/** Omitted fields are unchanged; an empty string clears the value */
export interface UpdateAccountRequest {
  tag?: string
  note?: string
}

/** Body for `PATCH /api/accounts/:id/status`. */
export interface UpdateStatusRequest {
  status: AccountStatus
}
