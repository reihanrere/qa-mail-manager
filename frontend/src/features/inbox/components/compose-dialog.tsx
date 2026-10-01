import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Loader2, Send } from 'lucide-react'
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
import { apiErrorMessage } from '@/lib/api-error'
import { inboxApi } from '../api'
import { parseRecipients, type ComposeValues } from '../utils/compose'

/**
 * Writes a plain-text email from an own-domain account, e.g. a reply to a message.
 * Sent through the backend's SMTP server.
 */
export function ComposeDialog({
  accountId,
  from,
  defaults,
  replyTo,
  children,
}: {
  accountId: string
  from: string
  defaults: ComposeValues
  /** Message id being answered, so the reply is threaded */
  replyTo?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ComposeValues>({ defaultValues: defaults })

  const send = useMutation({
    mutationFn: (values: ComposeValues) =>
      inboxApi.sendMessage(accountId, {
        to: parseRecipients(values.to),
        subject: values.subject,
        text: values.text,
        replyTo,
      }),
    onSuccess: (result) => {
      toast.success(t('compose.sent', { recipients: result.to.join(', ') }))
      setOpen(false)
      reset(defaults)
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('compose.sendFailed'))),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (send.isPending) return
        setOpen(next)
        if (next) reset(defaults)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg" showCloseButton={!send.isPending}>
        <form onSubmit={handleSubmit((values) => send.mutate(values))} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{replyTo ? t('compose.reply') : t('compose.newEmail')}</DialogTitle>
            <DialogDescription>
              {t('compose.from')} <span className="font-mono text-foreground">{from}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="compose-to">{t('compose.to')}</Label>
            <Input
              id="compose-to"
              autoComplete="off"
              aria-invalid={!!errors.to}
              disabled={send.isPending}
              {...register('to', {
                validate: (value) => {
                  const list = parseRecipients(value)
                  if (list.length === 0) return t('compose.recipientRequired')
                  return (
                    list.every((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) || t('compose.checkAddresses')
                  )
                },
              })}
            />
            {errors.to && <p className="text-xs text-destructive">{errors.to.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="compose-subject">{t('compose.subject')}</Label>
            <Input
              id="compose-subject"
              autoComplete="off"
              disabled={send.isPending}
              {...register('subject')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="compose-text">{t('compose.message')}</Label>
            <Textarea id="compose-text" rows={8} disabled={send.isPending} {...register('text')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={send.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="gap-2" disabled={send.isPending}>
              {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {t('compose.send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
