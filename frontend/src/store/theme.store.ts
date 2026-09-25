import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

/** Applies the theme class Tailwind's `dark:` variants key off. */
export function applyThemeClass(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

/** Light/dark preference, persisted to localStorage (defaults to dark). */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
      // Apply as soon as the stored value is read, before React renders, to avoid a flash
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.theme)
      },
    },
  ),
)
