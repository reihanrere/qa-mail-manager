import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AppLayout } from '@/components/layout/app-layout'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
