import { testIds } from '@tests/constants/testIds'
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useState,
} from 'react'
import { useT } from '@/content/i18n'
import type { Rect } from '@/shared/model'
import { isTrustedEvent } from '@/shared/trustedEvents'
import { onLayoutChange } from './layoutChange'
import type { PickSource } from './source'

function sameRects(a: Rect[], b: Rect[]): boolean {
  return (
    a.length === b.length &&
    a.every((rect, i) => {
      const other = b[i]
      return (
        other !== undefined &&
        rect.x === other.x &&
        rect.y === other.y &&
        rect.w === other.w &&
        rect.h === other.h
      )
    })
  )
}

/**
 * The source's shield rects, re-measured on scroll / resize with one measurement per frame. The
 * same array comes back while nothing moved, so a scroll on a page without frames renders nothing.
 */
export function useShieldRects(source: PickSource): Rect[] {
  const [shields, setShields] = useState<Rect[]>([])

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const next = source.shieldRects()
      setShields((previous) => (sameRects(previous, next) ? previous : next))
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    const unsubscribe = onLayoutChange(schedule)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [source])

  return shields
}

export interface ShieldsProps {
  rects: Rect[]
  /** Accessible name of a shield; the picker's "pick the frame" by default. */
  label?: string
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

/**
 * Transparent covers over iframes while a tool is active: pointer events inside a frame never
 * reach the top document, so without them a frame could be neither hovered, locked nor drawn
 * over as a whole (spec F3.7). Only trusted events reach the callbacks.
 */
export function Shields({ rects, label, onClick, onPointerDown }: ShieldsProps) {
  const t = useT('overlay')
  if (rects.length === 0) return null

  const trusted =
    <E extends { isTrusted: boolean }>(handler?: (event: E) => void) =>
    (event: E) => {
      if (handler && isTrustedEvent(event)) handler(event)
    }

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {rects.map((rect, index) => (
        <button
          key={`${rect.x}:${rect.y}:${rect.w}:${rect.h}`}
          type="button"
          tabIndex={-1}
          aria-label={label ?? t('picker.shield')}
          data-testid={testIds.pickerShield(index)}
          className="pointer-events-auto absolute m-0 cursor-default border-0 bg-transparent p-0"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          onClick={trusted(onClick)}
          onPointerDown={trusted(onPointerDown)}
          onContextMenu={(event) => event.preventDefault()}
        />
      ))}
    </div>
  )
}
