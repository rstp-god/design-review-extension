import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react'
import { clampToViewport, type Point, type Size } from '@/content/position'

const CLICK_THRESHOLD_PX = 3

export interface DragOptions {
  /** Current top-left corner; `null` while the toolbar sits in its default corner. */
  position: Point | null
  /** Size of the dragged box, read when the drag starts. */
  getSize: () => Size
  getViewport: () => Size
  onMove: (position: Point) => void
  onEnd: (position: Point) => void
}

export interface DragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

/**
 * Pointer-based dragging with pointer capture, clamped to the viewport. `wasDragged()` tells a
 * click handler on the same element whether the pointer moved (a drag) or not (a click).
 */
export function useDrag({ position, getSize, getViewport, onMove, onEnd }: DragOptions) {
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ pointer: Point; origin: Point; size: Size } | null>(null)
  const moved = useRef(false)

  const currentPosition = useCallback(
    (event: ReactPointerEvent<HTMLElement>): Point => {
      const state = start.current
      if (!state) return position ?? { x: 0, y: 0 }
      return clampToViewport(
        {
          x: state.origin.x + (event.clientX - state.pointer.x),
          y: state.origin.y + (event.clientY - state.pointer.y),
        },
        state.size,
        getViewport(),
      )
    },
    [getViewport, position],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      const rect = event.currentTarget.getBoundingClientRect()
      // The box may sit in its default corner (position null): use where it actually is.
      const origin = position ?? { x: rect.left, y: rect.top }
      start.current = { pointer: { x: event.clientX, y: event.clientY }, origin, size: getSize() }
      moved.current = false
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDragging(true)
    },
    [getSize, position],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = start.current
      if (!state) return
      const distance = Math.hypot(event.clientX - state.pointer.x, event.clientY - state.pointer.y)
      if (!moved.current && distance < CLICK_THRESHOLD_PX) return
      moved.current = true
      onMove(currentPosition(event))
    },
    [currentPosition, onMove],
  )

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!start.current) return
      const final = currentPosition(event)
      start.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      setDragging(false)
      if (moved.current) onEnd(final)
    },
    [currentPosition, onEnd],
  )

  const handlers: DragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
  }

  return { handlers, dragging, wasDragged: () => moved.current }
}
