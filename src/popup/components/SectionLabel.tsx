import type { ReactNode } from 'react'
import { cn } from '@/ui'

/** 11/16 semibold uppercase, muted — the section marker from tokens.md §4. */
export function SectionLabel({
  children,
  className,
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <div
      id={id}
      className={cn('text-label font-semibold uppercase tracking-label text-fg-muted', className)}
    >
      {children}
    </div>
  )
}
