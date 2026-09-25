import { useCallback, useState } from 'react'

/**
 * Runs a manual refresh and reports it as in progress for at least `minDuration` ms.
 * Local API calls finish in a few milliseconds, which would make a spinner flash invisibly.
 */
export function useRefresh(refresh: () => Promise<unknown>, minDuration = 600) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const run = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([refresh(), new Promise((resolve) => setTimeout(resolve, minDuration))])
    } finally {
      setIsRefreshing(false)
    }
  }, [refresh, minDuration])

  return { isRefreshing, refresh: run }
}
