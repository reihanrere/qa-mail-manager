import { useAppSettings } from '@/features/settings/queries'
import type { AppSettings, MailProviderName } from '@/types/settings'

/** The provider preselected in the generate dialog: the server default when usable, else the first usable one. */
export function initialProvider(settings: AppSettings | undefined): MailProviderName | undefined {
  if (!settings) return undefined
  const usable = settings.providers.filter((p) => p.available)
  return (usable.find((p) => p.name === settings.defaultProvider) ?? usable[0])?.name
}

/** Provider labels come from the backend so new providers need no frontend change. */
export function useProviderLabel() {
  const { data } = useAppSettings()
  return (name: MailProviderName) => data?.providers.find((p) => p.name === name)?.label ?? name
}
