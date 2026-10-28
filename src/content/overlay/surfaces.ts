import type { Rect } from '@/shared/model'

/**
 * Our own UI on top of the page: the toolbar, the hint pills, the picker tooltip. The picker
 * highlights nothing while the pointer is over one of them, the way DevTools does. Pointer events
 * cannot tell: the hint and the tooltip are `pointer-events: none` and never show up in
 * `elementsFromPoint`, so the surfaces are found by geometry instead — every surface carries this
 * attribute and is measured when the pointer moves.
 */
export const SURFACE_ATTRIBUTE = 'data-dr-surface'

export function surfaceProps(name: string): { [SURFACE_ATTRIBUTE]: string } {
  return { [SURFACE_ATTRIBUTE]: name }
}

/** The surface under a viewport point, as a rect, or `null` over the page. */
export function overlaySurfaceAt(root: ParentNode, x: number, y: number): Rect | null {
  for (const element of root.querySelectorAll(`[${SURFACE_ATTRIBUTE}]`)) {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
    }
  }
  return null
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
}
