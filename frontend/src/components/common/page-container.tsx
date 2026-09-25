import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type PageContainerProps = HTMLAttributes<HTMLDivElement>

/** Centered, padded column used by the dashboard, accounts and settings pages. */
export function PageContainer({ className, children, ...props }: PageContainerProps) {
  return (
    <div className={cn('mx-auto flex w-full max-w-7xl flex-col gap-6 p-6', className)} {...props}>
      {children}
    </div>
  )
}
