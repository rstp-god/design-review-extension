import type { ReactNode } from 'react'
import { cn } from './cn'

export interface KbdProps {
  children: ReactNode
  /** Inverted for use on the accent / inside the primary hint pill. */
  tone?: 'default' | 'subtle'
  className?: string
}

/** Key cap: mono 11/16 on a surface with a strong border (tokens.md §4, §5). */
export function Kbd({ children, tone = 'default', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex h-10 min-w-10 items-center justify-center rounded-xs border px-3',
        'font-mono text-label text-fg-secondary',
        tone === 'default' ? 'border-border-strong bg-surface' : 'border-border bg-surface-raised',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** A sequence of keys: `Alt` `Shift` `R`. */
export function KeyCombo({ keys, className }: { keys: readonly string[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      {keys.map((key, index) => (
        // A key can appear twice in one combo only in theory; the prefix keeps keys unique.
        <Kbd key={keys.slice(0, index + 1).join('+')}>{key}</Kbd>
      ))}
    </span>
  )
}
