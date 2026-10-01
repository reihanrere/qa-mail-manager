import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AppHeader } from '@/components/layout/app-header'
import { PageContainer } from '@/components/common/page-container'
import { AccountsList } from '@/features/account/components/accounts-list'

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  const { t } = useTranslation()
  return (
    <>
      <AppHeader title={t('pages.accounts.title')} description={t('pages.accounts.description')} />
      <PageContainer>
        <AccountsList />
      </PageContainer>
    </>
  )
}
