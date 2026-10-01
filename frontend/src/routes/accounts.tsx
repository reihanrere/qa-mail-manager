import { createFileRoute } from '@tanstack/react-router'
import { AppHeader } from '@/components/layout/app-header'
import { PageContainer } from '@/components/common/page-container'
import { AccountsList } from '@/features/account/components/accounts-list'

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  return (
    <>
      <AppHeader title="Accounts" description="Manage test email accounts" />
      <PageContainer>
        <AccountsList />
      </PageContainer>
    </>
  )
}
