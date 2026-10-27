import type { ReactNode } from 'react'

export const CHIP_HEIGHT = 22
export const CHIP_GAP = 8

/** Above a box when there is room, inside its top edge (plus `inset`) otherwise. */
export function chipTop(boxTop: number, inset = 0): number {
  const above = boxTop - CHIP_GAP - CHIP_HEIGHT
  return above >= 0 ? above : boxTop + inset + CHIP_GAP
}

/**
 * Mono label on the accent: the Locked node's `selector · W × H` (screens.md §05) and the area's
 * `W × H · x y` (§08). Announced as a status: it is the one piece of state worth reading out.
 */
export function Chip({
  left,
  top,
  label,
  testId,
  children,
}: {
  left: number
  top: number
  /** Accessible name of the status. */
  label: string
  testId: string
  children: ReactNode
}) {
  return (
    <div
      role="status"
      aria-label={label}
      data-testid={testId}
      className="absolute inline-flex h-11 max-w-[60vw] items-center rounded-sm bg-accent px-4 font-medium font-mono text-accent-fg text-label"
      style={{ left, top }}
    >
      <span className="truncate">{children}</span>
    </div>
  )
}
