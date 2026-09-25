import type { ApiResponse, PaginatedResponse } from './api'

/** Lifecycle of a test account: free to use, already used by a test, or blocked. */
export type AccountStatus = 'AVAILABLE' | 'USED' | 'BLOCKED'

/** A stored Mail.tm test account (the password never leaves the backend). */
export interface MailAccount {
  id: string
  accountId: string
  email: string
  domain: string
  status: AccountStatus
  tag: string
  note: string
  /** Newest inbox message, refreshed by the backend's background inbox sync */
  lastMessageAt: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

/** `latest_message` puts accounts with the most recent inbox activity first. */
export type AccountSort = 'newest' | 'latest_message'

/** Query parameters for `GET /api/accounts`. */
export interface ListAccountsParams {
  search?: string
  status?: AccountStatus
  sort?: AccountSort
  page?: number
  limit?: number
}

/** Response of `GET /api/accounts/stats`. */
export interface AccountStats {
  total: number
  byStatus: Record<AccountStatus, number>
  byDomain: { domain: string; count: number }[]
}

export type AccountsResponse = PaginatedResponse<MailAccount>
export type AccountResponse = ApiResponse<MailAccount>
export type AccountStatsResponse = ApiResponse<AccountStats>

/** Optional labels for `POST /api/accounts/generate` (tag ≤ 50, note ≤ 500 characters). */
export interface GenerateAccountRequest {
  tag?: string
  note?: string
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
