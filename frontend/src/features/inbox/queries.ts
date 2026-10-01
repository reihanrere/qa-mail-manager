import { useInfiniteQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { getNextPage } from '@/features/account/queries'
import { inboxApi } from './api'
import type { Page } from '@/types/api'
import type { Message } from '@/types/message'
import type { ListAccountsParams } from '@/types/account'

/** Inbox account panel: accounts with the most recent mail come first */
export const INBOX_ACCOUNT_PARAMS = { sort: 'latest_message', limit: 30 } satisfies ListAccountsParams

// New mail matters for OTP testing, so the open inbox refreshes itself
const MESSAGES_REFETCH_INTERVAL = 30_000

/** Query keys for inbox data; every list key for an account starts with `messageKeys.all(accountId)`. */
export const messageKeys = {
  all: (accountId: string | undefined) => ['messages', accountId] as const,
  list: (accountId: string | undefined, search: string) => ['messages', accountId, { search }] as const,
  detail: (accountId: string | undefined, messageId: string | undefined) =>
    ['message', accountId, messageId] as const,
}

/** An account's inbox, 30 messages per page (the backend's page size), optionally filtered by `search`. */
export function useInfiniteMessages(accountId: string | undefined, search: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.list(accountId, search),
    queryFn: ({ pageParam }) => inboxApi.listMessages(accountId!, { page: pageParam, search }),
    initialPageParam: 1,
    getNextPageParam: getNextPage,
    enabled: !!accountId,
    refetchInterval: MESSAGES_REFETCH_INTERVAL,
    // Keep rows visible while a new search runs, but never show another account's mail
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === accountId ? previous : undefined,
  })
}

/** Flattens loaded pages, dropping duplicates caused by new mail shifting page boundaries */
export function flattenMessages(data: InfiniteData<Page<Message>> | undefined): Message[] {
  const byId = new Map<string, Message>()
  for (const page of data?.pages ?? []) {
    for (const message of page.items) {
      if (!byId.has(message.id)) byId.set(message.id, message)
    }
  }
  return [...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/** Drops a deleted message from every cached list page for the account */
export function removeMessageFromCache(queryClient: QueryClient, accountId: string, messageId: string) {
  queryClient.setQueriesData<InfiniteData<Page<Message>>>({ queryKey: messageKeys.all(accountId) }, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((page) => {
            const items = page.items.filter((m) => m.id !== messageId)
            const removed = page.items.length - items.length
            return { ...page, items, meta: { ...page.meta, total: Math.max(0, page.meta.total - removed) } }
          }),
        }
      : old,
  )
  queryClient.removeQueries({ queryKey: messageKeys.detail(accountId, messageId) })
}

/** Updates a message's read state in every cached list page for the account */
export function setMessageSeenInCache(
  queryClient: QueryClient,
  accountId: string,
  messageId: string,
  seen: boolean,
) {
  queryClient.setQueriesData<InfiniteData<Page<Message>>>({ queryKey: messageKeys.all(accountId) }, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) => (m.id === messageId ? { ...m, seen } : m)),
          })),
        }
      : old,
  )
}
