import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { useLiveEvents } from '@/features/live/use-live-events'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  useLiveEvents()
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
