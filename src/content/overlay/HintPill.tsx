import type { ReactNode } from 'react'
import { cn, KeyCombo } from '@/ui'

/** The pill at the bottom of the screen (screens.md §03): keys of the current mode, or a path. */
export function HintPill({
  children,
  testId,
  className,
}: {
  children: ReactNode
  testId: string
  className?: string
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-12 z-10 flex justify-center px-8">
      <div
        data-testid={testId}
        className={cn(
          'pointer-events-auto inline-flex h-18 max-w-full items-center gap-4 rounded-xl border',
          'border-border bg-bg px-6 text-fg-secondary text-sm shadow-float',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function HintDot() {
  return (
    <span aria-hidden="true" className="text-fg-subtle">
      ·
    </span>
  )
}

/** `Esc` exit · `↑` `↓` parent / child. */
export function HintKeys({
  keys,
  label,
  className,
}: {
  keys: readonly string[]
  label: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap', className)}>
      <KeyCombo keys={keys} />
      <span>{label}</span>
    </span>
  )
}
