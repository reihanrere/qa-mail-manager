import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  Inbox,
  Mail,
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
import { useRefresh } from '@/hooks/use-refresh'
import { GenerateAccountDialog } from '@/features/account/components/account-dialogs'
import {
  ACCOUNT_STATUSES as STATUS_ORDER,
  ACCOUNT_STATUS_META as STATUS_META,
  type AccountStatus,
} from '@/features/account/status'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

const RECENT_LIMIT = 5

function percent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

function DashboardPage() {
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

  const stats = [
    {
      label: 'Total Accounts',
      value: total,
      icon: Users,
      description: `${domains.length} domain${domains.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Available',
      value: counts.AVAILABLE,
      icon: CheckCircle2,
      description: `${percent(counts.AVAILABLE, total)}% of total`,
    },
    {
      label: 'Used',
      value: counts.USED,
      icon: Mail,
      description: `${percent(counts.USED, total)}% of total`,
    },
    {
      label: 'Blocked',
      value: counts.BLOCKED,
      icon: ShieldAlert,
      description: `${percent(counts.BLOCKED, total)}% of total`,
    },
  ]

  const generateButton = (
    <GenerateAccountDialog>
      <Button className="gap-2">
        <UserPlus className="size-4" />
        Generate Account
      </Button>
    </GenerateAccountDialog>
  )

  return (
    <>
      <AppHeader title="Dashboard" description="Overview of your QA mail accounts" />

      <PageContainer>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">QA Mail Manager</h2>
            <p className="text-muted-foreground">Internal Testing Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isRefreshing}
              aria-label="Refresh data"
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
              title="Failed to load accounts"
              description="Make sure the backend API is running, then try again."
              className="w-full"
            />
            <Button variant="outline" onClick={() => refetch()}>
              Retry
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
                title="Recent Accounts"
                description="Latest generated accounts"
                className="min-w-0 lg:col-span-2"
                action={
                  <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1">
                    <Link to="/accounts">
                      View all
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
                    title="No accounts yet"
                    description="Generate your first test account to get started"
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
                              {formatDistanceToNow(new Date(account.createdAt), { addSuffix: true })}
                              {account.tag && ` · ${account.tag}`}
                            </p>
                          </div>
                          <Badge
                            variant={STATUS_META[account.status].badge}
                            className="hidden sm:inline-flex"
                          >
                            {STATUS_META[account.status].label}
                          </Badge>
                          <Inbox className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <div className="flex min-w-0 flex-col gap-4">
                <SectionCard title="Status Breakdown" description="Account availability for testing">
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
                            <span className="flex-1">{STATUS_META[status].label}</span>
                            <span className="font-medium tabular-nums">{counts[status]}</span>
                            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                              {percent(counts[status], total)}%
                            </span>
                          </li>
                        ))}
                      </ul>
                      {domains.length > 0 && (
                        <div className="space-y-2 border-t pt-4">
                          <p className="text-xs font-medium text-muted-foreground">Domains</p>
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

                <SectionCard title="Quick Actions">
                  <div className="grid grid-cols-1 gap-2">
                    <Button variant="outline" className="justify-start gap-2" asChild>
                      <Link to="/inbox">
                        <Inbox className="size-4" />
                        Open Inbox
                      </Link>
                    </Button>
                    <Button variant="outline" className="justify-start gap-2" asChild>
                      <Link to="/accounts">
                        <Settings2 className="size-4" />
                        Manage Accounts
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
