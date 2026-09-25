import { type ReactNode, useEffect } from 'react'
import { applyThemeClass, useThemeStore } from '@/store/theme.store'

/** Keeps the `<html>` theme class in sync with the theme store. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  return children
}
