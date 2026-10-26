import type { ReactNode } from 'react'
import { cn } from './cn'

export interface BadgeProps {
  children: ReactNode
  tone?: 'accent' | 'neutral'
  className?: string
  'data-testid'?: string
}

/** Count badge: 10/16 bold on the accent, pill-shaped (tokens.md §4). */
export function Badge({ children, tone = 'accent', className, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex h-8 min-w-8 items-center justify-center rounded-pill px-2',
        'font-sans text-badge font-bold tabular-nums',
        tone === 'accent' ? 'bg-accent text-accent-fg' : 'bg-surface-selected text-fg',
        className,
      )}
    >
      {children}
    </span>
  )
}
