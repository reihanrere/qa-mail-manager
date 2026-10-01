import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { accountApi } from '@/features/account/api'
import { accountKeys, useAccount } from '@/features/account/queries'
import { useAppSettings } from '@/features/settings/queries'

/**
 * Returns a callback for "the tester used this account's OTP or link". With the
 * `otp_copied` setting it moves an Available account to Used so nobody picks it again.
 */
export function useAutoMarkUsed(accountId: string | undefined) {
  const { data: settings } = useAppSettings()
  const { data: account } = useAccount(accountId)
  const queryClient = useQueryClient()

  return useCallback(() => {
    if (settings?.editable.autoMarkUsed !== 'otp_copied' || account?.status !== 'AVAILABLE') return
    accountApi
      .updateStatus(account.id, { status: 'USED' })
      .then(() => {
        toast.info('Account marked as Used')
        queryClient.invalidateQueries({ queryKey: accountKeys.all })
      })
      .catch(() => toast.error('Failed to mark the account as Used'))
  }, [settings, account, queryClient])
}
