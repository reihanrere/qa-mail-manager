import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadMoreTriggerProps {
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  /** Shown once everything is loaded; omit to render nothing at the end */
  endLabel?: string
  className?: string
}

// The observer must use the nearest scrolling ancestor as its root, otherwise a
// sentinel clipped inside a scroll container never reports as intersecting.
function getScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement
  while (parent) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

/** Invisible sentinel that calls `onLoadMore` when scrolled near the end of a list. */
export function LoadMoreTrigger({
  hasMore,
  isLoading,
  onLoadMore,
  endLabel,
  className,
}: LoadMoreTriggerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !hasMore || isLoading) return

    // Re-created after every load, so a sentinel that is still visible (short page) fires again
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore()
      },
      { root: getScrollParent(element), rootMargin: '0px 0px 240px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, isLoading, onLoadMore])

  return (
    <div
      ref={ref}
      className={cn('flex min-h-8 items-center justify-center py-2 text-xs text-muted-foreground', className)}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" />
          Loading more…
        </span>
      ) : !hasMore && endLabel ? (
        endLabel
      ) : null}
    </div>
  )
}
