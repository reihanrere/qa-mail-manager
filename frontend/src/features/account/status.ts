import type { AccountStatus } from '@/types/account'

export type { AccountStatus }

/** Statuses in display order. */
export const ACCOUNT_STATUSES: AccountStatus[] = ['AVAILABLE', 'USED', 'BLOCKED']

/** Status-dot colour and badge variant per status; labels are `status.<STATUS>` translations. */
export const ACCOUNT_STATUS_META: Record<
  AccountStatus,
  { dot: string; badge: 'default' | 'secondary' | 'destructive' }
> = {
  AVAILABLE: { dot: 'bg-emerald-500', badge: 'default' },
  USED: { dot: 'bg-amber-500', badge: 'secondary' },
  BLOCKED: { dot: 'bg-destructive', badge: 'destructive' },
}
