import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AppHeader title={t('pages.inbox.title')} description={t('pages.inbox.description')} />
      <InboxContainer />
    </div>
  )
}
