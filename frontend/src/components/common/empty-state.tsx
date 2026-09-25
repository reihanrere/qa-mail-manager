import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  actionIcon?: LucideIcon
  className?: string
}

/** Placeholder for empty or failed lists, with an optional call-to-action link. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  actionHref,
  actionIcon: ActionIcon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center',
        className,
      )}
    >
      <Icon className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && actionHref && (
        <Button variant="outline" asChild className="mt-4">
          <Link to={actionHref}>
            {ActionIcon && <ActionIcon className="mr-2 size-4" />}
            {actionLabel}
          </Link>
        </Button>
      )}
    </div>
  )
}
