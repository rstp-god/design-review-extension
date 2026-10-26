import { TOOLBAR_DEFAULT_INSET } from '@/shared/constants'

export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

/** Keeps a box of `size` fully inside the viewport, `margin` px away from the edges. */
export function clampToViewport(point: Point, size: Size, viewport: Size, margin = 0): Point {
  const maxX = Math.max(margin, viewport.w - size.w - margin)
  const maxY = Math.max(margin, viewport.h - size.h - margin)
  return {
    x: Math.min(Math.max(point.x, margin), maxX),
    y: Math.min(Math.max(point.y, margin), maxY),
  }
}

/** Top-right corner with the default inset (screens.md §03). */
export function defaultToolbarPosition(
  size: Size,
  viewport: Size,
  inset = TOOLBAR_DEFAULT_INSET,
): Point {
  return clampToViewport({ x: viewport.w - size.w - inset, y: inset }, size, viewport)
}
