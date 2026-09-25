import * as React from 'react'
import { cn } from '@/lib/utils'

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  className?: string
}

function Table({ className, ...props }: TableProps) {
  return (
    <div className="relative w-full overflow-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  className?: string
}

function TableHeader({ className, ...props }: TableHeaderProps) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  className?: string
}

function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

interface TableFooterProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  className?: string
}

function TableFooter({ className, ...props }: TableFooterProps) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  className?: string
}

function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      {...props}
    />
  )
}

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  className?: string
}

function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  className?: string
}

function TableCell({ className, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
}

interface TableCaptionProps extends React.HTMLAttributes<HTMLTableCaptionElement> {
  className?: string
}

function TableCaption({ className, ...props }: TableCaptionProps) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
