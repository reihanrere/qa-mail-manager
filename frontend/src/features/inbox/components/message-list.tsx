import { useState } from 'react'
import { Loader2, Mail, RefreshCw, Search } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/empty-state'
import { LoadMoreTrigger } from '@/components/common/load-more-trigger'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { flattenMessages, useInfiniteMessages } from '@/features/inbox/queries'
import { getSenderName } from '@/features/inbox/utils/format'
import type { Message } from '@/types/message'

type MessageFilter = 'all' | 'unread'

interface MessageListProps {
  accountId?: string
  selectedMessageId?: string
  onSelectMessage: (messageId: string) => void
}

/** Middle inbox pane: newest messages first with search, an Unread filter and infinite scroll. */
export function MessageList({ accountId, selectedMessageId, onSelectMessage }: MessageListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<MessageFilter>('all')

  // Mail.tm has no search API, so the backend scans the inbox; debounce to spare it
  const search = useDebouncedValue(searchTerm.trim(), 400)

  const {
    data,
    isLoading,
    isFetching,
    isPlaceholderData,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteMessages(accountId, search)

  const messages = flattenMessages(data)
  // Unread is filtered locally; the load-more trigger keeps fetching older pages behind it
  const filteredMessages = filter === 'all' ? messages : messages.filter((message) => !message.seen)
  const isSearching = isFetching && isPlaceholderData
  const isTruncated = data?.pages[0]?.meta?.truncated

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2 px-4">
        <h2 className="truncate text-lg font-bold">Inbox</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => refetch()}
          disabled={!accountId || isFetching}
          aria-label="Refresh messages"
        >
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
        </Button>
        <div className="ml-auto flex shrink-0 rounded-lg bg-muted p-1" role="tablist">
          {(['all', 'unread'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                filter === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'all' ? 'All mail' : 'Unread'}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div className="shrink-0 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-8 pl-8"
            aria-label="Search messages"
            disabled={!accountId}
          />
          {isSearching && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {isTruncated && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing matches from the latest 300 messages only.
          </p>
        )}
      </div>

      {!accountId ? (
        <EmptyState
          icon={Mail}
          title="Select an account"
          description="Choose an account to view its inbox"
          className="mx-4 mb-4"
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-2 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <p className="text-sm text-destructive">Failed to load messages</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : filteredMessages.length === 0 && !hasNextPage ? (
        <EmptyState
          icon={Mail}
          title="No messages found"
          description={
            searchTerm
              ? 'Try adjusting your search'
              : filter === 'unread'
                ? 'No unread messages'
                : 'No messages in this inbox yet'
          }
          className="mx-4 mb-4"
        />
      ) : (
        // Radix ScrollArea wraps content in a `display: table` div, which breaks truncation
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div
            className={cn('flex flex-col gap-2 px-4 pb-4 transition-opacity', isSearching && 'opacity-60')}
          >
            {filteredMessages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                isSelected={selectedMessageId === message.id}
                onClick={() => onSelectMessage(message.id)}
              />
            ))}
            <LoadMoreTrigger
              hasMore={!!hasNextPage}
              isLoading={isFetchingNextPage}
              onLoadMore={fetchNextPage}
              endLabel={messages.length > 0 && !search ? 'No older messages' : undefined}
            />
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

interface MessageItemProps {
  message: Message
  isSelected: boolean
  onClick: () => void
}

function MessageItem({ message, isSelected, onClick }: MessageItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        'flex w-full min-w-0 flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent',
        isSelected && 'bg-muted',
      )}
    >
      <div className="flex w-full min-w-0 flex-col gap-1">
        <div className="flex w-full min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{getSenderName(message.from)}</span>
          {!message.seen && <span className="size-2 shrink-0 rounded-full bg-blue-600" />}
          <time
            dateTime={message.createdAt}
            className={cn(
              'ml-auto shrink-0 text-xs whitespace-nowrap',
              isSelected ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </time>
        </div>
        <span className="w-full truncate text-xs font-medium">{message.subject || '(No subject)'}</span>
      </div>
      {message.intro && (
        <p className="line-clamp-2 w-full text-xs break-words text-muted-foreground">{message.intro}</p>
      )}
    </button>
  )
}
