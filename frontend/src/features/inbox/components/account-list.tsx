import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LoadMoreTrigger } from '@/components/common/load-more-trigger'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useInfiniteAccounts } from '@/features/account/queries'
import { ACCOUNT_STATUS_META } from '@/features/account/status'
import { INBOX_ACCOUNT_PARAMS } from '@/features/inbox/queries'
import { getInitials } from '@/features/inbox/utils/format'
import type { MailAccount } from '@/types/account'

// The backend's inbox sync refreshes lastMessageAt every couple of minutes
const ACCOUNTS_REFETCH_INTERVAL = 60_000

interface AccountListProps {
  selectedAccountId?: string
  onSelectAccount: (accountId: string) => void
  isCollapsed?: boolean
}

/**
 * Inbox account pane: accounts with the latest mail first, searchable, infinitely scrolling.
 * With `isCollapsed` it shows only initials (with tooltips) for the narrow pane.
 */
export function AccountList({ selectedAccountId, onSelectAccount, isCollapsed = false }: AccountListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const search = useDebouncedValue(searchTerm.trim(), 300)

  const {
    data,
    isPending,
    isFetching,
    isPlaceholderData,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteAccounts(
    { ...INBOX_ACCOUNT_PARAMS, search: search || undefined },
    { refetchInterval: ACCOUNTS_REFETCH_INTERVAL },
  )

  const accounts = data?.pages.flatMap((page) => page.items) ?? []
  const isSearching = isFetching && isPlaceholderData

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={cn('h-11', isCollapsed ? 'mx-auto size-9' : 'w-full')} />
        ))}
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        {!isCollapsed && <p className="text-sm text-destructive">Failed to load accounts</p>}
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const loadMore = (
    <LoadMoreTrigger
      hasMore={!!hasNextPage}
      isLoading={isFetchingNextPage}
      onLoadMore={fetchNextPage}
      className={isCollapsed ? 'min-h-6' : undefined}
    />
  )

  if (isCollapsed) {
    return (
      <ScrollArea className="h-full">
        <nav className="flex flex-col items-center gap-1 py-2">
          {accounts.map((account) => {
            const isSelected = selectedAccountId === account.id
            return (
              <Tooltip key={account.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectAccount(account.id)}
                    aria-label={account.email}
                    aria-pressed={isSelected}
                    className={cn(
                      'relative flex size-9 items-center justify-center rounded-md text-xs font-semibold transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {getInitials(account.email)}
                    <span
                      className={cn(
                        'absolute right-1 bottom-1 size-1.5 rounded-full',
                        ACCOUNT_STATUS_META[account.status].dot,
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex flex-col gap-0.5">
                  <span className="font-mono">{account.email}</span>
                  <span className="text-muted-foreground">{activityLabel(account)}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
          {loadMore}
        </nav>
      </ScrollArea>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search accounts"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-8 pl-8"
            aria-label="Search accounts"
          />
          {isSearching && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Radix ScrollArea wraps content in a `display: table` div, which breaks truncation */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        {accounts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {search ? 'No accounts found' : 'No accounts yet'}
          </p>
        ) : (
          <nav
            className={cn('flex flex-col gap-1 px-2 pb-2 transition-opacity', isSearching && 'opacity-60')}
          >
            {accounts.map((account) => (
              <AccountItem
                key={account.id}
                account={account}
                isSelected={selectedAccountId === account.id}
                onClick={() => onSelectAccount(account.id)}
              />
            ))}
            {loadMore}
          </nav>
        )}
      </ScrollArea>
    </div>
  )
}

function activityLabel(account: MailAccount) {
  if (!account.lastMessageAt) return 'No messages yet'
  const count = `${account.messageCount} message${account.messageCount === 1 ? '' : 's'}`
  return `${count} · ${formatDistanceToNowStrict(new Date(account.lastMessageAt), { addSuffix: true })}`
}

interface AccountItemProps {
  account: MailAccount
  isSelected: boolean
  onClick: () => void
}

function AccountItem({ account, isSelected, onClick }: AccountItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      title={account.email}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors',
        isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <span
        className={cn(
          'relative flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
          isSelected ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground',
        )}
      >
        {getInitials(account.email)}
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2',
            isSelected ? 'ring-primary' : 'ring-card',
            ACCOUNT_STATUS_META[account.status].dot,
          )}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-mono text-xs font-medium">{account.email}</span>
        <span
          className={cn(
            'truncate text-[11px]',
            isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {activityLabel(account)}
        </span>
      </span>
    </button>
  )
}
