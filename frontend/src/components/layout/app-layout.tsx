import { useEffect, type ReactNode } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAppStore } from '@/store/app.store'
import { useMediaQuery } from '@/hooks/use-media-query'

interface AppLayoutProps {
  children: ReactNode
}

function MobileSidebar() {
  const mobileSidebarOpen = useAppStore((state) => state.mobileSidebarOpen)
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // The desktop sidebar takes over at md, so don't leave the sheet overlay behind
  useEffect(() => {
    if (isDesktop) setMobileSidebarOpen(false)
  }, [isDesktop, setMobileSidebarOpen])

  return (
    <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-72 max-w-[85vw] gap-0 p-0"
      >
        <AppSidebar mobile />
      </SheetContent>
    </Sheet>
  )
}

/** Shell for every route: fixed sidebar on desktop, sheet sidebar on mobile, scrollable content. */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar className="hidden md:flex" />
      <MobileSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
