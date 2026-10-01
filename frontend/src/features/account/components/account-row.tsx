import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Copy, Inbox, Loader2, Pencil, RefreshCcw, Trash2 } from 'lucide-react'
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
import { LegacyBadge, ProviderBadge } from './provider-badge'
import { dateLocale } from '@/i18n'

/** Props shared by the per-row controls of the accounts table and mobile list. */
export interface AccountRowProps {
  account: MailAccount
  isUpdatingStatus: boolean
  onChangeStatus: (status: AccountStatus) => void
  onDelete: () => void
  onEdit: () => void
  /** Offered for legacy addresses: create a new address and block this one */
  onReplace: () => void
}

/** Monospace email with a copy button, plus the note underneath when present. */
export function EmailCell({ account }: { account: MailAccount }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(account.email)
      setCopied(true)
      toast.success(t('accounts.row.emailCopied'))
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('accounts.row.copyFailed'))
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0">
        <p className="truncate font-mono text-sm" title={account.email}>
          {account.email}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <ProviderBadge provider={account.provider} />
          {account.legacyName && <LegacyBadge />}
          {account.note && (
            <span className="truncate text-xs text-muted-foreground" title={account.note}>
              {account.note}
            </span>
          )}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={handleCopy}
            aria-label={t('accounts.row.copyEmail')}
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('accounts.row.copyEmail')}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** Status pill that opens a menu to change the account status. */
export function StatusMenu({ account, isUpdatingStatus, onChangeStatus }: AccountRowProps) {
  const { t } = useTranslation()
  const meta = ACCOUNT_STATUS_META[account.status]
  const label = t(`status.${account.status}`)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={isUpdatingStatus}
          aria-label={t('accounts.row.statusLabel', { status: label })}
        >
          {isUpdatingStatus ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <span className={cn('size-1.5 rounded-full', meta.dot)} />
          )}
          {label}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('accounts.row.changeStatus')}
        </DropdownMenuLabel>
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
              {t(`status.${status}`)}
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
  const { t } = useTranslation()
  const created = new Date(date)
  const relative = formatDistanceToNow(created, { addSuffix: true, locale: dateLocale() })
  if (inline) {
    return (
      <span className="text-xs text-muted-foreground">{t('accounts.row.createdRelative', { relative })}</span>
    )
  }
  return (
    <div className="flex flex-col">
      <span className="text-sm">{format(created, 'PP', { locale: dateLocale() })}</span>
      <span className="text-xs text-muted-foreground">{relative}</span>
    </div>
  )
}

/** Edit, open-inbox and delete buttons for one account. */
export function RowActions({ account, onDelete, onEdit, onReplace }: AccountRowProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-end gap-1">
      {account.legacyName && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400"
              onClick={onReplace}
              aria-label={t('accounts.row.replace')}
            >
              <RefreshCcw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('accounts.row.replace')}</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onEdit}
            aria-label={t('accounts.row.edit')}
          >
            <Pencil className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('accounts.row.edit')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <Link to="/inbox" search={{ account: account.id }} aria-label={t('accounts.row.openInbox')}>
              <Inbox className="size-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('accounts.row.openInbox')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            aria-label={t('accounts.row.delete')}
          >
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('accounts.row.delete')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
