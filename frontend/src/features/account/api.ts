import { api } from '@/lib/axios'
import type { Page } from '@/types/api'
import type {
  MailAccount,
  AccountsResponse,
  AccountResponse,
  AccountStats,
  AccountStatsResponse,
  GenerateAccountRequest,
  ListAccountsParams,
  UpdateAccountRequest,
  UpdateStatusRequest,
} from '@/types/account'

/** Account endpoints of the backend API. */
export const accountApi = {
  list: async (params: ListAccountsParams = {}): Promise<Page<MailAccount>> => {
    const response = await api.get<AccountsResponse>('/accounts', {
      params: { ...params, search: params.search || undefined },
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

  updateStatus: async (id: string, data: UpdateStatusRequest): Promise<void> => {
    await api.patch(`/accounts/${id}/status`, data)
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/accounts/${id}`)
  },
}
