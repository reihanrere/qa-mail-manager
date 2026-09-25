import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { accountApi } from './api'
import type { ListAccountsParams } from '@/types/account'
import type { Page } from '@/types/api'

// Every key starts with "accounts" so invalidating ["accounts"] refreshes lists, stats and details
export const accountKeys = {
  all: ['accounts'] as const,
  list: (params: Omit<ListAccountsParams, 'page'>) => ['accounts', 'list', params] as const,
  stats: ['accounts', 'stats'] as const,
  detail: (id: string) => ['accounts', 'detail', id] as const,
}

/** `getNextPageParam` for infinite queries: the next page number while the server reports more. */
export function getNextPage<T>(lastPage: Page<T>) {
  return lastPage.meta?.hasMore ? lastPage.meta.page + 1 : undefined
}

/** Paginated account list for the given filters; previous rows stay visible while new filters load. */
export function useInfiniteAccounts(
  params: Omit<ListAccountsParams, 'page'>,
  options: { refetchInterval?: number } = {},
) {
  return useInfiniteQuery({
    queryKey: accountKeys.list(params),
    queryFn: ({ pageParam }) => accountApi.list({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: getNextPage,
    // Keep showing the current rows while a new search/filter loads
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
  })
}

/** Account counts per status and domain. */
export function useAccountStats() {
  return useQuery({
    queryKey: accountKeys.stats,
    queryFn: accountApi.stats,
  })
}

export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: accountKeys.detail(id ?? ''),
    queryFn: () => accountApi.get(id!),
    enabled: !!id,
  })
}
