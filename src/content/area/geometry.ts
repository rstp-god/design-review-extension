import { formatBoxSize, formatNumber } from '@/shared/cssUnits'
import type { Rect } from '@/shared/model'

/**
 * Geometry of the area tool (spec 3.4), in viewport px, with no DOM: drawing a rectangle from an
 * anchor with the Shift (square) and Alt (from the center) modifiers, resizing it by a corner,
 * and keeping it inside the viewport. Everything here is pure and unit-tested.
 */

export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export interface DragModifiers {
  /** Shift: a square. */
  square: boolean
  /** Alt: the anchor is the center, not a corner. */
  fromCenter: boolean
}

/** Corner of the rectangle a handle sits on: `n`/`s` first, then `w`/`e`. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

export const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

/** Anything smaller counts as a click and is ignored (spec 3.4 AC). */
export const MIN_AREA_SIZE = 8

export const NO_MODIFIERS: DragModifiers = { square: false, fromCenter: false }

export function clampPoint(point: Point, viewport: Size): Point {
  return {
    x: Math.min(Math.max(point.x, 0), viewport.w),
    y: Math.min(Math.max(point.y, 0), viewport.h),
  }
}

function between(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

/**
 * The rectangle between the anchor (where the drag started) and the pointer, both clamped to
 * the viewport, so the area never leaves it (spec 3.4 AC).
 *
 * Shift: a square whose side is the larger of the two distances, grown in the pointer's
 * direction and limited by the distance to the viewport edge in that direction — it stays a
 * square at the edge instead of being cut into a rectangle.
 * Alt: the anchor is the center; each half size is limited by the shorter distance from the
 * anchor to the viewport edges on that axis, so the shape stays centered at the edge.
 */
export function rectFromDrag(
  anchor: Point,
  pointer: Point,
  modifiers: DragModifiers,
  viewport: Size,
): Rect {
  const a = clampPoint(anchor, viewport)
  const p = clampPoint(pointer, viewport)
  const dx = p.x - a.x
  const dy = p.y - a.y

  if (modifiers.fromCenter) {
    const maxHalfW = Math.min(a.x, viewport.w - a.x)
    const maxHalfH = Math.min(a.y, viewport.h - a.y)
    let halfW = Math.min(Math.abs(dx), maxHalfW)
    let halfH = Math.min(Math.abs(dy), maxHalfH)
    if (modifiers.square) {
      const half = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), maxHalfW, maxHalfH)
      halfW = half
      halfH = half
    }
    return { x: a.x - halfW, y: a.y - halfH, w: halfW * 2, h: halfH * 2 }
  }

  if (modifiers.square) {
    const signX = dx < 0 ? -1 : 1
    const signY = dy < 0 ? -1 : 1
    const roomX = signX > 0 ? viewport.w - a.x : a.x
    const roomY = signY > 0 ? viewport.h - a.y : a.y
    const side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), roomX, roomY)
    return between(a, { x: a.x + signX * side, y: a.y + signY * side })
  }

  return between(a, p)
}

/** Moves (and if needed shrinks) a rectangle so it lies inside the viewport. */
export function clampRect(rect: Rect, viewport: Size): Rect {
  const w = Math.min(rect.w, viewport.w)
  const h = Math.min(rect.h, viewport.h)
  return {
    x: Math.min(Math.max(rect.x, 0), viewport.w - w),
    y: Math.min(Math.max(rect.y, 0), viewport.h - h),
    w,
    h,
  }
}

export function isTooSmall(rect: Rect): boolean {
  return rect.w < MIN_AREA_SIZE || rect.h < MIN_AREA_SIZE
}

export function cornerPoint(rect: Rect, corner: Corner): Point {
  return {
    x: corner.endsWith('e') ? rect.x + rect.w : rect.x,
    y: corner.startsWith('s') ? rect.y + rect.h : rect.y,
  }
}

export function oppositeCorner(corner: Corner): Corner {
  const vertical = corner.startsWith('n') ? 's' : 'n'
  const horizontal = corner.endsWith('w') ? 'e' : 'w'
  return `${vertical}${horizontal}` as Corner
}

/**
 * Resizes by dragging a corner: the opposite corner is the anchor and the dragged corner follows
 * the pointer. Dragging it through the anchor inverts the rectangle; `corner` names the corner
 * the pointer holds afterwards, so the handle under the pointer stays the one being dragged.
 * Shift makes a square from the anchor; Alt has no meaning for a corner and is ignored.
 */
export function resizeFromCorner(
  rect: Rect,
  corner: Corner,
  pointer: Point,
  modifiers: Pick<DragModifiers, 'square'>,
  viewport: Size,
): { rect: Rect; corner: Corner } {
  const anchor = cornerPoint(rect, oppositeCorner(corner))
  const p = clampPoint(pointer, viewport)
  const next = rectFromDrag(anchor, p, { square: modifiers.square, fromCenter: false }, viewport)
  const vertical = p.y < anchor.y ? 'n' : 's'
  const horizontal = p.x < anchor.x ? 'w' : 'e'
  return { rect: next, corner: `${vertical}${horizontal}` as Corner }
}

/**
 * After a corner is released: a side shorter than the minimum grows to it, away from the anchor
 * (the corner opposite to the one that was dragged), then the whole rect is kept in the viewport.
 */
export function ensureMinSize(rect: Rect, corner: Corner, viewport: Size): Rect {
  if (!isTooSmall(rect)) return rect
  const anchor = cornerPoint(rect, oppositeCorner(corner))
  const w = Math.max(rect.w, MIN_AREA_SIZE)
  const h = Math.max(rect.h, MIN_AREA_SIZE)
  return clampRect(
    {
      x: corner.endsWith('w') ? anchor.x - w : anchor.x,
      y: corner.startsWith('n') ? anchor.y - h : anchor.y,
      w,
      h,
    },
    viewport,
  )
}

/** `620 × 104 · x 330 y 470` — the chip above the area (screens.md §08). */
export function formatAreaChip(rect: Rect): string {
  return `${formatBoxSize(rect.w, rect.h)} · x ${formatNumber(rect.x)} y ${formatNumber(rect.y)}`
}
