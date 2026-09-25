import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

function Sheet({ children, ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return (
    <SheetPrimitive.Root data-slot="sheet" {...props}>
      {children}
    </SheetPrimitive.Root>
  )
}

function SheetTrigger({ children, ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return (
    <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props}>
      {children}
    </SheetPrimitive.Trigger>
  )
}

function SheetClose({ children, ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return (
    <SheetPrimitive.Close data-slot="sheet-close" {...props}>
      {children}
    </SheetPrimitive.Close>
  )
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({
  side = 'right',
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'bottom' | 'left' | 'right'
  showCloseButton?: boolean
}) {
  return (
    <>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500',
          side === 'top' &&
            'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          side === 'bottom' &&
            'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
          className,
        )}
        {...props}
      >
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-secondary data-[state=open]:text-secondary-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
        {children}
      </SheetPrimitive.Content>
    </>
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
