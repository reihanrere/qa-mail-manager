import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AppHeader } from '@/components/layout/app-header'
import { InboxContainer } from '@/features/inbox/components/inbox-container'

const searchSchema = z.object({
  account: z.string().optional(),
})

export const Route = createFileRoute('/inbox')({
  validateSearch: searchSchema,
  component: InboxPage,
})

function InboxPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AppHeader title="Inbox" description="View and manage emails" />
      <InboxContainer />
    </div>
  )
}
