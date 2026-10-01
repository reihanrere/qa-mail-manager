import { api } from '@/lib/axios'
import { apiUrl } from '@/lib/api-url'
import type { ApiResponse, Page } from '@/types/api'
import type {
  MailAccount,
  AccountsResponse,
  AccountResponse,
  AccountStats,
  AccountStatsResponse,
  GenerateAccountRequest,
  ListAccountsParams,
  ReplaceAccountResult,
  BulkGenerateRequest,
  BulkGenerateResult,
  UpdateAccountRequest,
  UpdateStatusRequest,
} from '@/types/account'

/** Account endpoints of the backend API. */
export const accountApi = {
  list: async (params: ListAccountsParams = {}): Promise<Page<MailAccount>> => {
    const response = await api.get<AccountsResponse>('/accounts', {
      params: { ...params, search: params.search || undefined, legacy: params.legacy || undefined },
    })
    return { items: response.data.data ?? [], meta: response.data.meta }
  },

  get: async (id: string): Promise<MailAccount> => {
    const response = await api.get<AccountResponse>(`/accounts/${id}`)
    return response.data.data
  },

  update: async (id: string, data: UpdateAccountRequest): Promise<MailAccount> => {
    const response = await api.patch<AccountResponse>(`/accounts/${id}`, data)
    return response.data.data
  },

  stats: async (): Promise<AccountStats> => {
    const response = await api.get<AccountStatsResponse>('/accounts/stats')
    return response.data.data
  },

  generate: async (data?: GenerateAccountRequest): Promise<MailAccount> => {
    const response = await api.post<AccountResponse>('/accounts/generate', data ?? {})
    return response.data.data
  },

  generateBulk: async (data: BulkGenerateRequest): Promise<BulkGenerateResult> => {
    const response = await api.post<ApiResponse<BulkGenerateResult>>('/accounts/generate/bulk', data)
    return response.data.data
  },

  /** CSV download of every account matching the filters (no passwords) */
  exportUrl: (params: Omit<ListAccountsParams, 'page' | 'limit'> = {}) =>
    apiUrl('/accounts/export', {
      search: params.search || undefined,
      status: params.status,
      provider: params.provider,
      legacy: params.legacy || undefined,
      sort: params.sort,
    }),

  /** New address with the same provider and labels; the old account becomes BLOCKED */
  replace: async (id: string): Promise<ReplaceAccountResult> => {
    const response = await api.post<ApiResponse<ReplaceAccountResult>>(`/accounts/${id}/replace`)
    return response.data.data
  },

  updateStatus: async (id: string, data: UpdateStatusRequest): Promise<void> => {
    await api.patch(`/accounts/${id}/status`, data)
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/accounts/${id}`)
  },
}
