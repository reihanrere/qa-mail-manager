import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  Inbox,
  Mail,
  RefreshCcw,
  RefreshCw,
  Settings2,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { EmptyState } from '@/components/common/empty-state'
import { PageContainer } from '@/components/common/page-container'
import { SectionCard } from '@/components/common/section-card'
import { StatCard } from '@/components/common/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { accountApi } from '@/features/account/api'
import { useAccountStats } from '@/features/account/queries'
import { useProviderLabel } from '@/features/account/provider'
import { ProviderBadge } from '@/features/account/components/provider-badge'
import { useRefresh } from '@/hooks/use-refresh'
import { GenerateAccountDialog } from '@/features/account/components/account-dialogs'
import {
  ACCOUNT_STATUSES as STATUS_ORDER,
  ACCOUNT_STATUS_META as STATUS_META,
  type AccountStatus,
} from '@/features/account/status'
import { dateLocale } from '@/i18n'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

const RECENT_LIMIT = 5

function percent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

function DashboardPage() {
  const { t } = useTranslation()
  const statsQuery = useAccountStats()
  const recentQuery = useQuery({
    queryKey: ['accounts', 'recent', RECENT_LIMIT],
    queryFn: () => accountApi.list({ sort: 'newest', limit: RECENT_LIMIT }),
  })

  const isLoading = statsQuery.isPending || recentQuery.isPending
  const error = statsQuery.error ?? recentQuery.error
  const { isRefreshing, refresh: refetch } = useRefresh(() =>
    Promise.all([statsQuery.refetch(), recentQuery.refetch()]),
  )

  const total = statsQuery.data?.total ?? 0
  const counts = STATUS_ORDER.reduce(
    (acc, status) => ({ ...acc, [status]: statsQuery.data?.byStatus[status] ?? 0 }),
    {} as Record<AccountStatus, number>,
  )
  const recentAccounts = recentQuery.data?.items ?? []
  const domains = (statsQuery.data?.byDomain ?? []).map(({ domain, count }) => [domain, count] as const)
  const byProvider = statsQuery.data?.byProvider ?? []
  const legacyCount = statsQuery.data?.legacy ?? 0
  const providerLabel = useProviderLabel()

  const stats = [
    {
      label: t('dashboard.totalAccounts'),
      value: total,
      icon: Users,
      description: t('dashboard.domainCount', { count: domains.length }),
    },
    {
      label: t('status.AVAILABLE'),
      value: counts.AVAILABLE,
      icon: CheckCircle2,
      description: t('dashboard.percentOfTotal', { percent: percent(counts.AVAILABLE, total) }),
    },
    {
      label: t('status.USED'),
      value: counts.USED,
      icon: Mail,
      description: t('dashboard.percentOfTotal', { percent: percent(counts.USED, total) }),
    },
    {
      label: t('status.BLOCKED'),
      value: counts.BLOCKED,
      icon: ShieldAlert,
      description: t('dashboard.percentOfTotal', { percent: percent(counts.BLOCKED, total) }),
    },
  ]

  const generateButton = (
    <GenerateAccountDialog>
      <Button className="gap-2">
        <UserPlus className="size-4" />
        {t('dashboard.generateAccount')}
      </Button>
    </GenerateAccountDialog>
  )

  return (
    <>
      <AppHeader title={t('pages.dashboard.title')} description={t('pages.dashboard.description')} />

      <PageContainer>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">{t('common.appName')}</h2>
            <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isRefreshing}
              aria-label={t('dashboard.refresh')}
            >
              <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />
            </Button>
            {generateButton}
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-4">
            <EmptyState
              icon={ShieldAlert}
              title={t('dashboard.loadFailed')}
              description={t('dashboard.loadFailedHint')}
              className="w-full"
            />
            <Button variant="outline" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[116px] rounded-xl" />
                  ))
                : stats.map((stat) => (
                    <StatCard
                      key={stat.label}
                      label={stat.label}
                      value={stat.value}
                      icon={stat.icon}
                      description={stat.description}
                    />
                  ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SectionCard
                title={t('dashboard.recentAccounts')}
                description={t('dashboard.recentAccountsHint')}
                className="min-w-0 lg:col-span-2"
                action={
                  <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1">
                    <Link to="/accounts">
                      {t('dashboard.viewAll')}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                }
              >
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: RECENT_LIMIT }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : recentAccounts.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title={t('dashboard.noAccounts')}
                    description={t('dashboard.noAccountsHint')}
                  />
                ) : (
                  <ul className="-mx-2 divide-y">
                    {recentAccounts.map((account) => (
                      <li key={account.id}>
                        <Link
                          to="/inbox"
                          search={{ account: account.id }}
                          className="flex min-w-0 items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/50"
                        >
                          <span
                            className={cn('size-2 shrink-0 rounded-full', STATUS_META[account.status].dot)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-sm">{account.email}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(account.createdAt), {
                                addSuffix: true,
                                locale: dateLocale(),
                              })}
                              {account.tag && ` · ${account.tag}`}
                            </p>
                          </div>
                          <Badge
                            variant={STATUS_META[account.status].badge}
                            className="hidden sm:inline-flex"
                          >
                            {t(`status.${account.status}`)}
                          </Badge>
                          <Inbox className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <div className="flex min-w-0 flex-col gap-4">
                <SectionCard
                  title={t('dashboard.statusBreakdown')}
                  description={t('dashboard.statusBreakdownHint')}
                >
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        {STATUS_ORDER.map((status) =>
                          counts[status] > 0 ? (
                            <div
                              key={status}
                              className={STATUS_META[status].dot}
                              style={{ width: `${percent(counts[status], total)}%` }}
                            />
                          ) : null,
                        )}
                      </div>
                      <ul className="space-y-2 text-sm">
                        {STATUS_ORDER.map((status) => (
                          <li key={status} className="flex items-center gap-2">
                            <span className={cn('size-2 rounded-full', STATUS_META[status].dot)} />
                            <span className="flex-1">{t(`status.${status}`)}</span>
                            <span className="font-medium tabular-nums">{counts[status]}</span>
                            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                              {percent(counts[status], total)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                      {byProvider.length > 0 && (
                        <div className="space-y-3 border-t pt-4">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('dashboard.providers')}
                          </p>
                          <ul className="space-y-3 text-sm">
                            {byProvider.map(({ provider, count, messages }) => (
                              <li key={provider} className="space-y-1.5">
                                <div className="flex min-w-0 items-center gap-2">
                                  <ProviderBadge provider={provider} />
                                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                    {t('dashboard.messageCount', { count: messages })}
                                  </span>
                                  <span className="font-medium tabular-nums">{count}</span>
                                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                                    {percent(count, total)}%
                                  </span>
                                </div>
                                <div
                                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                                  role="img"
                                  aria-label={t('dashboard.providerShare', {
                                    provider: providerLabel(provider),
                                    percent: percent(count, total),
                                  })}
                                >
                                  <div
                                    className={cn(
                                      'h-full rounded-full',
                                      provider === 'local' ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                                    )}
                                    style={{ width: `${percent(count, total)}%` }}
                                  />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {domains.length > 0 && (
                        <div className="space-y-2 border-t pt-4">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('dashboard.domains')}
                          </p>
                          <ul className="space-y-1.5 text-sm">
                            {domains.map(([domain, count]) => (
                              <li key={domain} className="flex min-w-0 items-center gap-2">
                                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate font-mono text-xs">{domain}</span>
                                <span className="font-medium tabular-nums">{count}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title={t('dashboard.quickActions')}>
                  <div className="grid grid-cols-1 gap-2">
                    {legacyCount > 0 && (
                      <Button
                        variant="outline"
                        className="justify-start gap-2 border-amber-500/40 text-amber-700 dark:text-amber-400"
                        asChild
                      >
                        <Link to="/accounts">
                          <RefreshCcw className="size-4" />
                          {t('dashboard.legacyToReplace', { count: legacyCount })}
                        </Link>
                      </Button>
                    )}
                    <Button variant="outline" className="justify-start gap-2" asChild>
                      <Link to="/inbox">
                        <Inbox className="size-4" />
                        {t('dashboard.openInbox')}
                      </Link>
                    </Button>
                    <Button variant="outline" className="justify-start gap-2" asChild>
                      <Link to="/accounts">
                        <Settings2 className="size-4" />
                        {t('dashboard.manageAccounts')}
                      </Link>
                    </Button>
                  </div>
                </SectionCard>
              </div>
            </div>
          </>
        )}
      </PageContainer>
    </>
  )
}
