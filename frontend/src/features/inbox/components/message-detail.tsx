import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCheck,
  Download,
  FileCode,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { cn } from '@/lib/utils'
import { inboxApi } from '@/features/inbox/api'
import { messageKeys, removeMessageFromCache, setMessageSeenInCache } from '@/features/inbox/queries'
import { accountKeys } from '@/features/account/queries'
import { extractOTPFromMessage } from '@/features/inbox/utils/otp'
import { formatBytes, getInitials, getSenderAddress, getSenderName } from '@/features/inbox/utils/format'
import { resolveCidImages } from '@/features/inbox/utils/cid'
import type { MessageAttachment } from '@/types/message'
import { OTPCard } from './otp-card'

interface MessageDetailProps {
  accountId?: string
  messageId?: string
  onBack?: () => void
  /** Called after the open message is deleted so the parent can clear the selection */
  onDeleted?: () => void
}

/**
 * Detail pane for one message: header, OTP card and sandboxed HTML body. Opening an unread
 * message marks it read; the toolbar can reload or delete it.
 */
export function MessageDetail({ accountId, messageId, onBack, onDeleted }: MessageDetailProps) {
  const {
    data: message,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: messageKeys.detail(accountId, messageId),
    queryFn: () => inboxApi.getMessage(accountId!, messageId!),
    enabled: !!accountId && !!messageId,
  })

  const markAsRead = useMarkAsRead(accountId)
  const attemptedIds = useRef(new Set<string>())

  // Opening a message does not mark it read on Mail.tm, so do it explicitly (once per message)
  useEffect(() => {
    if (!message || message.seen || message.id !== messageId) return
    if (attemptedIds.current.has(message.id)) return
    attemptedIds.current.add(message.id)
    markAsRead.mutate(message.id)
  }, [message, messageId, markAsRead])

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2 px-2">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to messages">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={!message || isFetching}
              aria-label="Reload message"
            >
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload message</TooltipContent>
        </Tooltip>
        {accountId && message && message.id === messageId && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={inboxApi.sourceUrl(accountId, message.id)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View source"
                  >
                    <FileCode className="size-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View source (raw email and headers)</TooltipContent>
            </Tooltip>
            <DeleteMessageButton accountId={accountId} message={message} onDeleted={onDeleted} />
          </>
        )}
        {message && message.id === messageId && (
          <span className="ml-auto flex items-center gap-1.5 pr-2 text-xs text-muted-foreground">
            {markAsRead.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Marking as read…
              </>
            ) : message.seen ? (
              <>
                <CheckCheck className="size-3.5 text-emerald-500" />
                Read
              </>
            ) : null}
          </span>
        )}
      </div>

      <Separator />

      {!messageId ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            icon={Mail}
            title="No message selected"
            description="Choose a message from the list to view its details"
            className="border-none"
          />
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Separator />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error || !message ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            icon={Mail}
            title="Failed to load message"
            description="Unable to load message details"
            className="border-none"
          />
        </div>
      ) : (
        <MessageContent accountId={accountId!} message={message} />
      )}
    </div>
  )
}

function DeleteMessageButton({
  accountId,
  message,
  onDeleted,
}: {
  accountId: string
  message: MessageData
  onDeleted?: () => void
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const deleteMessage = useMutation({
    mutationFn: () => inboxApi.deleteMessage(accountId, message.id),
    onSuccess: () => {
      setOpen(false)
      // Clear the selection first so the detail query is not refetched for a message that is gone
      onDeleted?.()
      removeMessageFromCache(queryClient, accountId, message.id)
      // The backend refreshes the account's message count right after the delete
      setTimeout(() => queryClient.invalidateQueries({ queryKey: accountKeys.all }), 2000)
      toast.success('Message deleted')
    },
    onError: () => toast.error('Failed to delete message'),
  })

  return (
    <AlertDialog open={open} onOpenChange={(next) => !deleteMessage.isPending && setOpen(next)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete message"
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Delete message</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this message?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium break-words text-foreground">
              {message.subject || '(No subject)'}
            </span>{' '}
            will be permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMessage.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleteMessage.isPending}
            onClick={() => deleteMessage.mutate()}
            className="gap-2"
          >
            {deleteMessage.isPending && <Loader2 className="size-4 animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function useMarkAsRead(accountId: string | undefined) {
  const queryClient = useQueryClient()

  const setSeen = (messageId: string, seen: boolean) => {
    if (!accountId) return
    setMessageSeenInCache(queryClient, accountId, messageId, seen)
    queryClient.setQueryData<MessageData>(messageKeys.detail(accountId, messageId), (old) =>
      old ? { ...old, seen } : old,
    )
  }

  return useMutation({
    mutationFn: (messageId: string) => inboxApi.markAsRead(accountId!, messageId),
    // Optimistic, so the unread dot disappears as soon as the message opens
    onMutate: (messageId) => setSeen(messageId, true),
    onError: (_, messageId) => {
      setSeen(messageId, false)
      toast.error('Failed to mark message as read')
    },
  })
}

type MessageData = Awaited<ReturnType<typeof inboxApi.getMessage>>

function MessageContent({ accountId, message }: { accountId: string; message: MessageData }) {
  const otp = extractOTPFromMessage(message)
  const senderName = getSenderName(message.from)
  const senderAddress = getSenderAddress(message.from)
  const toLabels = (message.to ?? []).map((t) => t.address).join(', ')
  const rawHtml = message.html?.[0]
  const html =
    rawHtml &&
    resolveCidImages(rawHtml, message.attachments, (a) => inboxApi.attachmentUrl(accountId, message.id, a.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start gap-4 p-4">
        <Avatar className="size-10">
          <AvatarFallback>{getInitials(senderName)}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-1 text-sm">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="max-w-full shrink-0 truncate font-semibold">{senderName}</span>
            {senderAddress && senderAddress !== senderName && (
              <span className="hidden min-w-0 truncate text-xs text-muted-foreground @xl:inline">
                &lt;{senderAddress}&gt;
              </span>
            )}
          </div>
          <div className="truncate text-xs font-medium" title={message.subject}>
            {message.subject || '(No subject)'}
          </div>
          <div className="truncate text-xs" title={toLabels}>
            <span className="font-medium">To:</span>{' '}
            <span className="font-mono text-muted-foreground">{toLabels || '-'}</span>
          </div>
        </div>
        <time
          dateTime={message.createdAt}
          className="hidden shrink-0 text-xs text-muted-foreground @md:block"
        >
          {format(new Date(message.createdAt), 'PPp')}
        </time>
      </div>

      <Separator />

      {otp && (
        <div className="shrink-0 px-4 pt-4">
          <OTPCard otp={otp} />
        </div>
      )}

      {message.attachments?.length > 0 && (
        <AttachmentList accountId={accountId} messageId={message.id} attachments={message.attachments} />
      )}

      {html ? (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          {/* Sandboxed so the email's own styles and scripts cannot affect the app */}
          <iframe
            title="Message content"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:16px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111;word-break:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`}
            className="min-h-40 w-full flex-1 rounded-md border bg-white"
          />
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div className="p-4 text-sm break-words whitespace-pre-wrap">
            {message.text || (
              <span className="text-muted-foreground">This message has no readable content</span>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

/** Attachments as chips: the name opens the file (images and text in the browser), the icon downloads it. */
function AttachmentList({
  accountId,
  messageId,
  attachments,
}: {
  accountId: string
  messageId: string
  attachments: MessageAttachment[]
}) {
  return (
    <div className="shrink-0 px-4 pt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Paperclip className="size-3.5" />
        {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <li
            key={attachment.id}
            className="flex max-w-full min-w-0 items-center rounded-md border bg-muted/40 text-xs"
          >
            <a
              href={inboxApi.attachmentUrl(accountId, messageId, attachment.id)}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 py-1.5 pr-1 pl-2.5 hover:underline"
              title={`${attachment.filename} (${attachment.contentType})`}
            >
              <span className="truncate font-medium">{attachment.filename}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatBytes(attachment.size)}
              </span>
            </a>
            <a
              href={inboxApi.attachmentUrl(accountId, messageId, attachment.id, true)}
              className="flex shrink-0 items-center px-2 py-1.5 text-muted-foreground hover:text-foreground"
              aria-label={`Download ${attachment.filename}`}
            >
              <Download className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
