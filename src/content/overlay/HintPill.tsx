import type { ReactNode } from 'react'
import { cn, KeyCombo } from '@/ui'
import { surfaceProps } from './surfaces'

/** The pill at the bottom of the screen (screens.md §03): keys of the current mode, or a path. */
export function HintPill({
  children,
  testId,
  interactive = false,
  className,
}: {
  children: ReactNode
  testId: string
  /** Only a pill with controls takes pointer events; a plain hint lets clicks reach the page. */
  interactive?: boolean
  className?: string
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-12 z-10 flex justify-center px-8">
      <div
        data-testid={testId}
        {...surfaceProps('hint')}
        className={cn(
          'inline-flex h-18 max-w-full items-center gap-4 rounded-xl border',
          'border-border bg-bg px-6 text-fg-secondary text-sm shadow-float',
          interactive && 'pointer-events-auto',
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
