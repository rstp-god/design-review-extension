import { useEffect, useRef } from 'react'
import type { Rect } from '@/shared/model'
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
  target = window,
}: PointerTrackingOptions): void {
  const last = useRef<{ x: number; y: number } | null>(null)
  const current = useRef<{ node: PickNode; styles: NodeStyles; path: PathEntry[] } | null>(null)

  useEffect(() => {
    if (!active) {
      current.current = null
      onHover(null)
      return
    }

    const doc = target.document
    let frame = 0

    const step = () => {
      frame = 0
      const point = last.current
      if (!point) return
      const started = onSample ? performance.now() : 0

      const node = source.hitTest(point.x, point.y)
      if (!node) {
        current.current = null
        onHover(null)
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
    const onMove = (event: PointerEvent) => {
      last.current = { x: event.clientX, y: event.clientY }
      schedule()
    }
    const onLeave = () => {
      last.current = null
      current.current = null
      onHover(null)
    }

    target.addEventListener('pointermove', onMove, { capture: true, passive: true })
    target.addEventListener('scroll', schedule, { capture: true, passive: true })
    target.addEventListener('resize', schedule)
    doc.documentElement.addEventListener('pointerleave', onLeave)
    schedule()

    return () => {
      if (frame !== 0) target.cancelAnimationFrame(frame)
      target.removeEventListener('pointermove', onMove, { capture: true })
      target.removeEventListener('scroll', schedule, { capture: true })
      target.removeEventListener('resize', schedule)
      doc.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [active, source, onHover, onSample, target])
}
