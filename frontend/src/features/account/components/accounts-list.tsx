import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Loader2, Plus, RefreshCcw, RefreshCw, Search, Users } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProviderLabel } from '../provider'
import type { MailProviderName } from '@/types/settings'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/common/empty-state'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '@/lib/api-error'
import { accountApi } from '../api'
import { useAccountStats, useInfiniteAccounts } from '../queries'
import { EditAccountDialog, GenerateAccountDialog } from './account-dialogs'
import { CreatedAt, EmailCell, RowActions, StatusMenu, TagLabel } from './account-row'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useRefresh } from '@/hooks/use-refresh'
import { LoadMoreTrigger } from '@/components/common/load-more-trigger'
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_META, type AccountStatus } from '../status'
import type { MailAccount } from '@/types/account'

type StatusFilter = 'ALL' | AccountStatus
type ProviderFilter = 'ALL' | MailProviderName

const PAGE_SIZE = 25

/**
 * Accounts page body: header actions, search + status filter, and an infinitely
 * scrolling table (desktop) or list (mobile) with per-row status/edit/delete.
 */
export function AccountsList() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('ALL')
  const [legacyOnly, setLegacyOnly] = useState(false)
  const [pendingReplace, setPendingReplace] = useState<MailAccount | null>(null)
  const providerLabel = useProviderLabel()
  const [pendingDelete, setPendingDelete] = useState<MailAccount | null>(null)
  const [editing, setEditing] = useState<MailAccount | null>(null)

  const search = useDebouncedValue(searchTerm.trim(), 300)

  const statsQuery = useAccountStats()
  const {
    data,
    isPending: isLoading,
    isFetching,
    isPlaceholderData,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteAccounts({
    sort: 'newest',
    limit: PAGE_SIZE,
    search: search || undefined,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    provider: providerFilter === 'ALL' ? undefined : providerFilter,
    legacy: legacyOnly || undefined,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccountStatus }) =>
      accountApi.updateStatus(id, { status }),
    onSuccess: (_, { status }) => {
      toast.success(`Status changed to ${ACCOUNT_STATUS_META[status].label}`)
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: () => toast.error('Failed to update status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountApi.delete(id),
    onSuccess: () => {
      toast.success('Account deleted')
      setPendingDelete(null)
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: () => toast.error('Failed to delete account'),
  })

  const replaceMutation = useMutation({
    mutationFn: (id: string) => accountApi.replace(id),
    onSuccess: (result) => {
      toast.success(`Replaced with ${result.account.email}`, {
        description: 'The old address is now Blocked; its inbox stays readable.',
      })
      setPendingReplace(null)
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Failed to replace account')),
  })

  const counts = useMemo(() => {
    const result = { ALL: statsQuery.data?.total ?? 0 } as Record<StatusFilter, number>
    for (const status of ACCOUNT_STATUSES) {
      result[status] = statsQuery.data?.byStatus[status] ?? 0
    }
    return result
  }, [statsQuery.data])

  const filteredAccounts = data?.pages.flatMap((page) => page.items) ?? []
  const matchCount = data?.pages[0]?.meta.total ?? 0
  const isFiltering = isFetching && isPlaceholderData
  const { isRefreshing, refresh } = useRefresh(() => Promise.all([refetch(), statsQuery.refetch()]))

  const rowProps = (account: MailAccount) => ({
    account,
    isUpdatingStatus: statusMutation.isPending && statusMutation.variables?.id === account.id,
    onChangeStatus: (status: AccountStatus) => statusMutation.mutate({ id: account.id, status }),
    onDelete: () => setPendingDelete(account),
    onEdit: () => setEditing(account),
    onReplace: () => setPendingReplace(account),
  })

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Accounts</h2>
          <p className="text-muted-foreground">
            {statsQuery.isPending
              ? 'Loading accounts…'
              : `${counts.ALL} test account${counts.ALL === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={isRefreshing}
            aria-label="Refresh accounts"
          >
            <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <a
              href={accountApi.exportUrl({
                search: search || undefined,
                status: statusFilter === 'ALL' ? undefined : statusFilter,
                provider: providerFilter === 'ALL' ? undefined : providerFilter,
                legacy: legacyOnly || undefined,
              })}
              download
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </a>
          </Button>
          <GenerateAccountDialog>
            <Button className="gap-2">
              <Plus className="size-4" />
              Generate Account
            </Button>
          </GenerateAccountDialog>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <div className="relative md:max-w-xs md:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search email, domain, tag or note"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-8 pl-8"
              aria-label="Search accounts"
            />
            {isFiltering && (
              <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={providerFilter}
              onValueChange={(value) => setProviderFilter(value as ProviderFilter)}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Filter by provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All providers</SelectItem>
                {(statsQuery.data?.byProvider ?? []).map(({ provider, count }) => (
                  <SelectItem key={provider} value={provider}>
                    {providerLabel(provider)}
                    <span className="text-muted-foreground tabular-nums">{count}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(legacyOnly || (statsQuery.data?.legacy ?? 0) > 0) && (
              <Button
                variant={legacyOnly ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1.5"
                aria-pressed={legacyOnly}
                onClick={() => setLegacyOnly((value) => !value)}
              >
                <span className="size-1.5 rounded-full bg-amber-500" />
                Old format
                <span className="text-muted-foreground tabular-nums">{statsQuery.data?.legacy ?? 0}</span>
              </Button>
            )}
          </div>
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:ml-auto md:px-0">
            <div className="flex w-max rounded-lg bg-muted p-1" role="tablist" aria-label="Filter by status">
              {(['ALL', ...ACCOUNT_STATUSES] as StatusFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                    statusFilter === value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {value !== 'ALL' && (
                    <span className={cn('size-1.5 rounded-full', ACCOUNT_STATUS_META[value].dot)} />
                  )}
                  {value === 'ALL' ? 'All' : ACCOUNT_STATUS_META[value].label}
                  <span className="text-muted-foreground tabular-nums">{counts[value]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-destructive">Failed to load accounts</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <EmptyState
            icon={Users}
            title={counts.ALL === 0 ? 'No accounts yet' : 'No accounts found'}
            description={
              counts.ALL === 0
                ? 'Generate your first test account to get started'
                : 'Try adjusting your search or filters'
            }
            className="m-4"
          />
        ) : (
          <div className={cn('transition-opacity', isFiltering && 'opacity-60')}>
            {/* Desktop: table */}
            <Table className="hidden table-fixed md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10">Email</TableHead>
                  <TableHead className="h-10 w-36">Status</TableHead>
                  <TableHead className="hidden h-10 w-32 lg:table-cell">Tag</TableHead>
                  <TableHead className="h-10 w-40">Created</TableHead>
                  <TableHead className="h-10 w-40 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => {
                  const props = rowProps(account)
                  return (
                    <TableRow key={account.id} className="group">
                      <TableCell className="py-2.5">
                        <EmailCell account={account} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <StatusMenu {...props} />
                      </TableCell>
                      <TableCell className="hidden py-2.5 lg:table-cell">
                        <TagLabel tag={account.tag} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <CreatedAt date={account.createdAt} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <RowActions {...props} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* Mobile: stacked list */}
            <ul className="divide-y md:hidden">
              {filteredAccounts.map((account) => {
                const props = rowProps(account)
                return (
                  <li key={account.id} className="flex flex-col gap-2 p-4">
                    <EmailCell account={account} />
                    <div className="flex items-center gap-2">
                      <StatusMenu {...props} />
                      {account.tag && <TagLabel tag={account.tag} />}
                      <div className="ml-auto">
                        <RowActions {...props} />
                      </div>
                    </div>
                    <CreatedAt date={account.createdAt} inline />
                  </li>
                )
              })}
            </ul>

            <LoadMoreTrigger
              hasMore={!!hasNextPage}
              isLoading={isFetchingNextPage}
              onLoadMore={fetchNextPage}
              endLabel={`Showing all ${matchCount} account${matchCount === 1 ? '' : 's'}`}
              className="border-t"
            />
          </div>
        )}
      </Card>

      <EditAccountDialog account={editing} onOpenChange={(open) => !open && setEditing(null)} />

      <AlertDialog
        open={!!pendingReplace}
        onOpenChange={(open) => !open && !replaceMutation.isPending && setPendingReplace(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this address?</AlertDialogTitle>
            <AlertDialogDescription>
              A new realistic address is generated on the same provider with the same tag and note.{' '}
              <span className="font-mono break-all text-foreground">{pendingReplace?.email}</span> is marked
              Blocked so it is not used again; its inbox stays readable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={replaceMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              disabled={replaceMutation.isPending}
              onClick={() => pendingReplace && replaceMutation.mutate(pendingReplace.id)}
              className="gap-2"
            >
              {replaceMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
              Replace
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono break-all text-foreground">{pendingDelete?.email}</span> will be
              removed from QA Mail Manager.{' '}
              {pendingDelete?.provider === 'local'
                ? 'Its stored messages are deleted too, and new mail to this address will be rejected.'
                : 'The mailbox on Mail.tm is not deleted, but you will no longer be able to read its inbox here.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              className="gap-2"
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
