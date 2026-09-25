import type { AccountStatus } from '@/types/account'

export type { AccountStatus }

/** Statuses in display order. */
export const ACCOUNT_STATUSES: AccountStatus[] = ['AVAILABLE', 'USED', 'BLOCKED']

/** Label, status-dot colour and badge variant per status, shared by every page. */
export const ACCOUNT_STATUS_META: Record<
  AccountStatus,
  { label: string; dot: string; badge: 'default' | 'secondary' | 'destructive' }
> = {
  AVAILABLE: { label: 'Available', dot: 'bg-emerald-500', badge: 'default' },
  USED: { label: 'Used', dot: 'bg-amber-500', badge: 'secondary' },
  BLOCKED: { label: 'Blocked', dot: 'bg-destructive', badge: 'destructive' },
}
