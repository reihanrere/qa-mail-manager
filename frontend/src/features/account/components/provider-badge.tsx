import { cn } from '@/lib/utils'
import type { MailProviderName } from '@/types/settings'
import { useProviderLabel } from '../provider'

/** Small chip naming the mail provider that owns an account. */
export function ProviderBadge({ provider, className }: { provider: MailProviderName; className?: string }) {
  const label = useProviderLabel()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        provider === 'local'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {label(provider)}
    </span>
  )
}

/** Marks an address created with the old, detectable naming scheme. */
export function LegacyBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      title="Created with the old qa_test_ naming that signup forms detect. Replace it with a new address."
    >
      Old format
    </span>
  )
}
