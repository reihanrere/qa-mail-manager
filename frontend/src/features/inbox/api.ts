import { api } from '@/lib/axios'
import { apiUrl } from '@/lib/api-url'
import type { Page } from '@/types/api'
import type { Message, MessageDetail, MessageListResponse, MessageDetailResponse } from '@/types/message'

/** Inbox endpoints; the backend reads the mailbox from the account's provider. */
export const inboxApi = {
  listMessages: async (
    accountId: string,
    params: { page?: number; search?: string } = {},
  ): Promise<Page<Message>> => {
    const response = await api.get<MessageListResponse>(`/accounts/${accountId}/messages`, {
      params: { page: params.page, search: params.search || undefined },
    })
    return { items: response.data.data ?? [], meta: response.data.meta }
  },

  getMessage: async (accountId: string, messageId: string): Promise<MessageDetail> => {
    const response = await api.get<MessageDetailResponse>(`/accounts/${accountId}/messages/${messageId}`)
    return response.data.data
  },

  deleteMessage: async (accountId: string, messageId: string): Promise<void> => {
    await api.delete(`/accounts/${accountId}/messages/${messageId}`)
  },

  markAsRead: async (accountId: string, messageId: string): Promise<void> => {
    await api.patch(`/accounts/${accountId}/messages/${messageId}/read`)
  },

  /** Link to an attachment; `download` forces a file download instead of opening it */
  attachmentUrl: (accountId: string, messageId: string, attachmentId: string, download = false) =>
    apiUrl(`/accounts/${accountId}/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`, {
      download,
    }),

  /** Link to the raw message (shown as text; `download` saves it as .eml) */
  sourceUrl: (accountId: string, messageId: string, download = false) =>
    apiUrl(`/accounts/${accountId}/messages/${messageId}/source`, { download }),
}
