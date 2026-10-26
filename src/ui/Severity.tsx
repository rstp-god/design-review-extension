import type { Severity } from '@/shared/model'
import { cn } from './cn'

/**
 * Severity is never conveyed by color alone (CLAUDE.md, tokens.md §1): each level has its own
 * marker shape — blocker circle, major rounded square, minor square — and a text label next to it.
 */
const dotShape: Record<Severity, string> = {
  blocker: 'rounded-pill bg-blocker',
  major: 'rounded-[2px] bg-major',
  minor: 'rounded-none bg-minor',
}

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-severity={severity}
      className={cn('inline-block size-8 shrink-0', dotShape[severity], className)}
    />
  )
}

export const severityTextClass: Record<Severity, string> = {
  blocker: 'text-blocker-text',
  major: 'text-major-text',
  minor: 'text-minor-text',
}
