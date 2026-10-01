import { useState } from 'react'
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { VerificationLink } from '../utils/links'

/** Highlights detected verification / login / reset links with open and copy buttons. */
export function VerificationLinkCard({
  links,
  onUsed,
}: {
  links: VerificationLink[]
  /** Called when a link is opened or copied (e.g. to mark the account as used) */
  onUsed?: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      onUsed?.()
      setCopied(url)
      toast.success(t('links.copied'))
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error(t('links.copyFailed'))
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link2 className="size-3.5" />
        {t('links.title', { count: links.length })}
      </p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.url} className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{link.label}</p>
              <p className="truncate font-mono text-xs text-muted-foreground" title={link.url}>
                {link.url}
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
              <a href={link.url} target="_blank" rel="noreferrer noopener" onClick={onUsed}>
                <ExternalLink className="size-3.5" />
                {t('common.open')}
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => copy(link.url)}
              aria-label={t('links.copy')}
            >
              {copied === link.url ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
