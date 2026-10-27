import type { Rect } from '@/shared/model'

/**
 * A Floating UI virtual element for a viewport rect: the picker tooltip and the area actions
 * anchor to geometry, not to an element — the node may live in another tree, and a snapshot
 * source has no elements at all.
 */
export function rectReference(rect: Rect) {
  return {
    getBoundingClientRect: () => ({
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
    }),
  }
}
