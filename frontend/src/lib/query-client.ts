import { QueryClient } from '@tanstack/react-query'

/**
 * Shared TanStack Query client. Retries are off so API errors surface immediately in the UI;
 * lists that need fresh data (inbox, accounts) set their own refetch intervals.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
})
