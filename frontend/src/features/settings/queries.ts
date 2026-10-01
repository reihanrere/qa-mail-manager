import { useQuery } from '@tanstack/react-query'
import { settingsApi } from './api'

export const settingsKeys = {
  all: ['settings'] as const,
}

/** Backend settings; they only change when the server is reconfigured, so cache them for a while. */
export function useAppSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: settingsApi.get,
    staleTime: 5 * 60 * 1000,
  })
}
