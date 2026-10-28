import { useEffect, useRef } from 'react'
import { rectContains } from '@/content/overlay/surfaces'
import type { Rect } from '@/shared/model'
import { isTrustedEvent } from '@/shared/trustedEvents'
import { onLayoutChange } from './layoutChange'
import type { BoxModel, NodeStyles, PathEntry, PickNode, PickSource } from './source'

/** Everything the hover UI needs about the node under the pointer. */
export interface HoverState {
  node: PickNode
  rect: Rect
  box: BoxModel
  styles: NodeStyles
  path: PathEntry[]
}

export interface PointerTrackingOptions {
  source: PickSource
  /** `false` while Locked: the pointer is ignored and the hover is cleared. */
  active: boolean
  onHover: (hover: HoverState | null) => void
  /** Duration of one tracking step, ms — the E2E build collects these. */
  onSample?: (ms: number) => void
  /** E2E build only: while `true`, pointer events are ignored so a screenshot cannot disturb the hover. */
  frozen?: () => boolean
  /**
   * Our own UI under the point (overlay/surfaces.ts): nothing is highlighted there. The rect is
   * kept as a dead zone until the pointer leaves it, so hiding the tooltip under the pointer
   * does not immediately bring it back for the node that is now under the pointer.
   */
  isOverUi?: (x: number, y: number) => Rect | null
  target?: Window
}

/**
 * Follows the pointer with at most one hit test per animation frame (spec 4.2): `pointermove`
 * only records the position and asks for a frame; the frame does the work. Rect and box model are
 * re-read on every step (they change on scroll, resize and layout), styles, path and selector
 * only when the node changes. Scroll and resize re-run the step for the last known position.
 */
export function usePointerTracking({
  source,
  active,
  onHover,
  onSample,
  frozen,
  isOverUi,
  target = window,
}: PointerTrackingOptions): void {
  const last = useRef<{ x: number; y: number } | null>(null)
  const current = useRef<{ node: PickNode; styles: NodeStyles; path: PathEntry[] } | null>(null)
  const deadZone = useRef<Rect | null>(null)

  useEffect(() => {
    if (!active) {
      current.current = null
      onHover(null)
      return
    }

    const doc = target.document
    let frame = 0

    const clear = () => {
      current.current = null
      onHover(null)
    }

    const step = () => {
      frame = 0
      const point = last.current
      if (!point) return
      const started = onSample ? performance.now() : 0

      if (deadZone.current && rectContains(deadZone.current, point.x, point.y)) {
        clear()
        return
      }
      deadZone.current = isOverUi?.(point.x, point.y) ?? null
      if (deadZone.current) {
        clear()
        return
      }

      const node = source.hitTest(point.x, point.y)
      if (!node) {
        clear()
      } else {
        if (current.current?.node !== node) {
          current.current = { node, styles: source.stylesOf(node), path: source.pathOf(node) }
        }
        onHover({
          node,
          rect: source.rectOf(node),
          box: source.boxModelOf(node),
          styles: current.current.styles,
          path: current.current.path,
        })
      }

      if (onSample) onSample(performance.now() - started)
    }

    const schedule = () => {
      if (frame === 0) frame = target.requestAnimationFrame(step)
    }
    // Only the user's pointer steers the hover: a page dispatching synthetic moves cannot.
    const onMove = (event: PointerEvent) => {
      if (!isTrustedEvent(event) || frozen?.()) return
      last.current = { x: event.clientX, y: event.clientY }
      schedule()
    }
    const onLeave = () => {
      if (frozen?.()) return
      last.current = null
      deadZone.current = null
      clear()
    }

    target.addEventListener('pointermove', onMove, { capture: true, passive: true })
    doc.documentElement.addEventListener('pointerleave', onLeave)
    const unsubscribe = onLayoutChange(schedule, target)
    schedule()

    return () => {
      if (frame !== 0) target.cancelAnimationFrame(frame)
      deadZone.current = null
      target.removeEventListener('pointermove', onMove, { capture: true })
      doc.documentElement.removeEventListener('pointerleave', onLeave)
      unsubscribe()
    }
  }, [active, source, onHover, onSample, frozen, isOverUi, target])
}
