import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import type { MailAccount } from '@/types/account'

// Mirrors the backend limits in services.MaxTagLength / MaxNoteLength
const MAX_TAG_LENGTH = 50
const MAX_NOTE_LENGTH = 500

interface LabelsFormValues {
  tag: string
  note: string
}

// Counts characters the way the backend does (Unicode code points, after trimming)
const charCount = (value: string) => [...value.trim()].length

/** Opens a dialog to create a Mail.tm account with an optional tag and note. */
export function GenerateAccountDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Bumped after each success so the next open starts with an empty form
  const [formKey, setFormKey] = useState(0)
  const queryClient = useQueryClient()

  const generate = useMutation({
    mutationFn: (values: LabelsFormValues) =>
      accountApi.generate({ tag: values.tag.trim() || undefined, note: values.note.trim() || undefined }),
    onSuccess: (account) => {
      toast.success(`Generated ${account.email}`)
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      setOpen(false)
      setFormKey((key) => key + 1)
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Failed to generate account')),
  })

  return (
    <LabelsDialog
      key={formKey}
      open={open}
      onOpenChange={setOpen}
      trigger={children}
      title="Generate account"
      description="Creates a new Mail.tm inbox with a random address. Tag and note are optional and only stored here."
      submitLabel="Generate"
      pendingLabel="Generating…"
      mutation={generate}
      defaultValues={{ tag: '', note: '' }}
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
}: LabelsDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<LabelsFormValues>({ defaultValues })

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

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="account-tag">Tag</Label>
              <CharacterCount length={tagLength} max={MAX_TAG_LENGTH} />
            </div>
            <Input
              id="account-tag"
              placeholder="e.g. login-flow"
              autoComplete="off"
              aria-invalid={!!errors.tag}
              disabled={mutation.isPending}
              {...register('tag', {
                validate: (value) =>
                  charCount(value) <= MAX_TAG_LENGTH || `Tag must be at most ${MAX_TAG_LENGTH} characters`,
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
              <CharacterCount length={noteLength} max={MAX_NOTE_LENGTH} />
            </div>
            <Textarea
              id="account-note"
              placeholder="What is this account for?"
              rows={3}
              aria-invalid={!!errors.note}
              disabled={mutation.isPending}
              {...register('note', {
                validate: (value) =>
                  charCount(value) <= MAX_NOTE_LENGTH || `Note must be at most ${MAX_NOTE_LENGTH} characters`,
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
              disabled={mutation.isPending || (requireChanges && !isDirty)}
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

function CharacterCount({ length, max }: { length: number; max: number }) {
  return (
    <span className={cn('text-xs tabular-nums', length > max ? 'text-destructive' : 'text-muted-foreground')}>
      {length}/{max}
    </span>
  )
}
