import { api } from '@/lib/axios'
import type { AppSettings, AppSettingsResponse, SettingsPatch } from '@/types/settings'

/** Backend runtime configuration (providers, limits, inbox options). */
export const settingsApi = {
  get: async (): Promise<AppSettings> => {
    const response = await api.get<AppSettingsResponse>('/settings')
    return response.data.data
  },

  update: async (patch: SettingsPatch): Promise<AppSettings> => {
    const response = await api.patch<AppSettingsResponse>('/settings', patch)
    return response.data.data
  },
}
