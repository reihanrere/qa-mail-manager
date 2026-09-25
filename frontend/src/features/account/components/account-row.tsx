import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Check, ChevronDown, Copy, Inbox, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_META, type AccountStatus } from '../status'
import type { MailAccount } from '@/types/account'

/** Props shared by the per-row controls of the accounts table and mobile list. */
export interface AccountRowProps {
  account: MailAccount
  isUpdatingStatus: boolean
  onChangeStatus: (status: AccountStatus) => void
  onDelete: () => void
  onEdit: () => void
}

/** Monospace email with a copy button, plus the note underneath when present. */
export function EmailCell({ account }: { account: MailAccount }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(account.email)
      setCopied(true)
      toast.success('Email copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy email')
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm" title={account.email}>
          {account.email}
        </p>
        {account.note && (
          <p className="truncate text-xs text-muted-foreground" title={account.note}>
            {account.note}
          </p>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={handleCopy}
            aria-label="Copy email"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy email</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Status pill that opens a menu to change the account status. */
export function StatusMenu({ account, isUpdatingStatus, onChangeStatus }: AccountRowProps) {
  const meta = ACCOUNT_STATUS_META[account.status]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={isUpdatingStatus}
          aria-label={`Status: ${meta.label}. Change status`}
        >
          {isUpdatingStatus ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <span className={cn('size-1.5 rounded-full', meta.dot)} />
          )}
          {meta.label}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Change status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={account.status}
          onValueChange={(value) => {
            if (value !== account.status) onChangeStatus(value as AccountStatus)
          }}
        >
          {ACCOUNT_STATUSES.map((status) => (
            <DropdownMenuRadioItem key={status} value={status} className="gap-2">
              <span className={cn('size-1.5 rounded-full', ACCOUNT_STATUS_META[status].dot)} />
              {ACCOUNT_STATUS_META[status].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Tag chip, or an em dash when the account has no tag. */
export function TagLabel({ tag }: { tag: string }) {
  if (!tag) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <span className="inline-block max-w-full truncate rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {tag}
    </span>
  )
}

/** Creation date with a relative time; `inline` renders a single muted line for mobile. */
export function CreatedAt({ date, inline = false }: { date: string; inline?: boolean }) {
  const created = new Date(date)
  const relative = formatDistanceToNow(created, { addSuffix: true })
  if (inline) {
    return <span className="text-xs text-muted-foreground">Created {relative}</span>
  }
  return (
    <div className="flex flex-col">
      <span className="text-sm">{format(created, 'MMM d, yyyy')}</span>
      <span className="text-xs text-muted-foreground">{relative}</span>
    </div>
  )
}

/** Edit, open-inbox and delete buttons for one account. */
export function RowActions({ account, onDelete, onEdit }: AccountRowProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onEdit}
            aria-label="Edit tag and note"
          >
            <Pencil className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Edit tag &amp; note</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <Link to="/inbox" search={{ account: account.id }} aria-label="Open inbox">
              <Inbox className="size-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open inbox</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            aria-label="Delete account"
          >
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete account</TooltipContent>
      </Tooltip>
    </div>
  )
}
