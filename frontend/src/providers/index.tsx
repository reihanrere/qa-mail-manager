import type { ReactNode } from 'react'
import { Toaster } from 'sonner'
import { QueryProvider } from '@/providers/query-provider'
import { ThemeProvider } from '@/providers/theme-provider'

/** App-wide providers: TanStack Query, theme syncing and toast notifications. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        {children}
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryProvider>
  )
}
