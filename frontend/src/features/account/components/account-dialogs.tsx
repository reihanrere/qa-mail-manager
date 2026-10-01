import { useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '@/lib/api-error'
import { accountApi } from '../api'
import { accountKeys } from '../queries'
import { initialProvider } from '../provider'
import { useAppSettings } from '@/features/settings/queries'
import type { MailAccount } from '@/types/account'
import type { AppSettings, MailProviderName, ProviderStatus } from '@/types/settings'

interface LabelsFormValues {
  tag: string
  note: string
  /** Generate dialog only */
  provider?: MailProviderName
  /** Generate dialog only; RANDOM_DOMAIN lets the provider pick */
  domain?: string
  /** Generate dialog only: how many accounts to create */
  count?: string
}

const RANDOM_DOMAIN = '__random__'

type Limits = AppSettings['limits']

// Counts characters the way the backend does (Unicode code points, after trimming)
const charCount = (value: string) => [...value.trim()].length

/** Opens a dialog to create an account on a chosen provider with an optional tag and note. */
export function GenerateAccountDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Bumped after each success so the next open starts with an empty form
  const [formKey, setFormKey] = useState(0)
  const queryClient = useQueryClient()
  const settings = useAppSettings()

  const generate = useMutation({
    mutationFn: async (values: LabelsFormValues) => {
      const request = {
        tag: values.tag.trim() || undefined,
        note: values.note.trim() || undefined,
        provider: values.provider,
        domain: values.domain && values.domain !== RANDOM_DOMAIN ? values.domain : undefined,
      }
      const count = Number(values.count ?? 1)
      if (count > 1) return accountApi.generateBulk({ ...request, count })
      const account = await accountApi.generate(request)
      return { accounts: [account], requested: 1, error: undefined }
    },
    onSuccess: (result) => {
      const emails = result.accounts.map((a) => a.email)
      if (emails.length === 1) {
        toast.success(`Generated ${emails[0]}`)
      } else {
        toast.success(`Generated ${emails.length} accounts`, {
          description: emails.slice(0, 3).join(', ') + (emails.length > 3 ? ', …' : ''),
        })
      }
      if (result.error) {
        toast.warning(`Stopped after ${emails.length} of ${result.requested}`, { description: result.error })
      }
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      setOpen(false)
      setFormKey((key) => key + 1)
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Failed to generate account')),
  })

  return (
    <LabelsDialog
      // Remount once when settings first arrive so the provider default is applied; later
      // refetches (on open) must not reset what the user is typing
      key={`${formKey}-${settings.data ? 'ready' : 'loading'}`}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Domains and availability can change (e.g. Mail.tm down), so re-check on open
        if (next) settings.refetch()
      }}
      trigger={children}
      title="Generate account"
      description="Creates a new inbox with a realistic-looking address. Tag and note are optional and only stored here."
      submitLabel="Generate"
      pendingLabel="Generating…"
      mutation={generate}
      limits={settings.data?.limits}
      providers={settings.data?.providers ?? []}
      providersLoading={settings.isPending}
      maxCount={settings.data?.editable.bulkGenerateMax}
      defaultValues={{
        tag: '',
        note: '',
        provider: initialProvider(settings.data),
        domain: RANDOM_DOMAIN,
        count: '1',
      }}
    />
  )
}

/** Controlled dialog to edit an existing account's tag and note; open while `account` is set. */
export function EditAccountDialog({
  account,
  onOpenChange,
}: {
  account: MailAccount | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const settings = useAppSettings()

  const update = useMutation({
    mutationFn: (values: LabelsFormValues) =>
      accountApi.update(account!.id, { tag: values.tag.trim(), note: values.note.trim() }),
    onSuccess: () => {
      toast.success('Account updated')
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      onOpenChange(false)
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update account')),
  })

  return (
    <LabelsDialog
      // Remount per account so the form starts from that account's current values
      key={account?.id ?? 'none'}
      open={!!account}
      onOpenChange={onOpenChange}
      title="Edit account"
      description={<span className="font-mono break-all text-foreground">{account?.email}</span>}
      submitLabel="Save changes"
      pendingLabel="Saving…"
      requireChanges
      mutation={update}
      limits={settings.data?.limits}
      defaultValues={{ tag: account?.tag ?? '', note: account?.note ?? '' }}
    />
  )
}

interface LabelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactNode
  title: string
  description: ReactNode
  submitLabel: string
  pendingLabel: string
  defaultValues: LabelsFormValues
  /** Disable submit until a field differs from its default (avoids no-op edits) */
  requireChanges?: boolean
  /** Label limits from the backend; unknown while settings load (the server still validates) */
  limits?: Limits
  /** When given, a provider picker is shown (generate dialog) */
  providers?: ProviderStatus[]
  providersLoading?: boolean
  /** When given, a "how many" field allows bulk generation up to this count */
  maxCount?: number
  mutation: {
    mutate: (values: LabelsFormValues) => void
    reset: () => void
    isPending: boolean
    isError: boolean
    error: unknown
  }
}

function LabelsDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  submitLabel,
  pendingLabel,
  defaultValues,
  requireChanges = false,
  mutation,
  limits,
  providers,
  providersLoading = false,
  maxCount,
}: LabelsDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<LabelsFormValues>({ defaultValues })

  const showProviders = providers !== undefined
  const selectedProvider = useWatch({ control, name: 'provider' })
  const selectedStatus = providers?.find((p) => p.name === selectedProvider)
  const selectedDomain = selectedStatus?.domain
  const domainChoices = selectedStatus?.domains ?? []
  const noUsableProvider = showProviders && !providersLoading && !providers.some((p) => p.available)
  const tagLength = charCount(useWatch({ control, name: 'tag' }))
  const noteLength = charCount(useWatch({ control, name: 'note' }))

  const handleOpenChange = (next: boolean) => {
    // Keep the dialog open while the request is in flight
    if (mutation.isPending) return
    onOpenChange(next)
    if (!next) {
      reset(defaultValues)
      mutation.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md" showCloseButton={!mutation.isPending}>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {showProviders && (
            <div className="grid gap-2">
              <Label htmlFor="account-provider">Provider</Label>
              <Controller
                control={control}
                name="provider"
                rules={{ required: 'Choose a provider' }}
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(value) => {
                      field.onChange(value as MailProviderName)
                      // Domains differ per provider
                      setValue('domain', RANDOM_DOMAIN)
                    }}
                    disabled={mutation.isPending || providersLoading || noUsableProvider}
                  >
                    <SelectTrigger id="account-provider" className="w-full" aria-invalid={!!errors.provider}>
                      <SelectValue
                        placeholder={providersLoading ? 'Loading providers…' : 'Choose a provider'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.name} value={p.name} disabled={!p.available}>
                          <span>{p.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.available ? `@${p.domain}` : 'unavailable'}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.provider ? (
                <p className="text-xs text-destructive">{errors.provider.message}</p>
              ) : noUsableProvider ? (
                <p className="text-xs text-destructive">
                  No provider can create accounts right now. Check the Settings page for details.
                </p>
              ) : (
                selectedDomain && (
                  <p className="text-xs text-muted-foreground">
                    Address will look like <span className="font-mono">name.surname@{selectedDomain}</span>
                  </p>
                )
              )}
            </div>
          )}

          {showProviders && domainChoices.length > 1 && (
            <div className="grid gap-2">
              <Label htmlFor="account-domain">Domain</Label>
              <Controller
                control={control}
                name="domain"
                render={({ field }) => (
                  <Select
                    value={field.value ?? RANDOM_DOMAIN}
                    onValueChange={field.onChange}
                    disabled={mutation.isPending}
                  >
                    <SelectTrigger id="account-domain" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={RANDOM_DOMAIN}>Random ({domainChoices.length} domains)</SelectItem>
                      {domainChoices.map((domain) => (
                        <SelectItem key={domain} value={domain}>
                          <span className="font-mono">@{domain}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {maxCount !== undefined && (
            <div className="grid gap-2">
              <Label htmlFor="account-count">How many</Label>
              <Input
                id="account-count"
                type="number"
                min={1}
                max={maxCount}
                className="w-28"
                aria-invalid={!!errors.count}
                disabled={mutation.isPending}
                {...register('count', {
                  validate: (value) => {
                    const n = Number(value)
                    return (
                      (Number.isInteger(n) && n >= 1 && n <= maxCount) ||
                      `Enter a number from 1 to ${maxCount}`
                    )
                  },
                })}
              />
              {errors.count ? (
                <p className="text-xs text-destructive">{errors.count.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Up to {maxCount} at once, all with the same tag and note.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="account-tag">Tag</Label>
              <CharacterCount length={tagLength} max={limits?.tagMaxLength} />
            </div>
            <Input
              id="account-tag"
              placeholder="e.g. login-flow"
              autoComplete="off"
              aria-invalid={!!errors.tag}
              disabled={mutation.isPending}
              {...register('tag', {
                validate: (value) =>
                  !limits ||
                  charCount(value) <= limits.tagMaxLength ||
                  `Tag must be at most ${limits.tagMaxLength} characters`,
              })}
            />
            {errors.tag ? (
              <p className="text-xs text-destructive">{errors.tag.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Group accounts by feature or test suite; searchable later.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="account-note">Note</Label>
              <CharacterCount length={noteLength} max={limits?.noteMaxLength} />
            </div>
            <Textarea
              id="account-note"
              placeholder="What is this account for?"
              rows={3}
              aria-invalid={!!errors.note}
              disabled={mutation.isPending}
              {...register('note', {
                validate: (value) =>
                  !limits ||
                  charCount(value) <= limits.noteMaxLength ||
                  `Note must be at most ${limits.noteMaxLength} characters`,
              })}
            />
            {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
          </div>

          {mutation.isError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {apiErrorMessage(mutation.error, 'Request failed')}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending || (requireChanges && !isDirty) || noUsableProvider || providersLoading
              }
              className="gap-2"
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {mutation.isPending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CharacterCount({ length, max }: { length: number; max?: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        max !== undefined && length > max ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {max === undefined ? length : `${length}/${max}`}
    </span>
  )
}
