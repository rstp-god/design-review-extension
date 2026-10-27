import type { Rect } from '@/shared/model'
import type { BoxModel, Edges } from './source'

/** The four rectangles DevTools paints: margin ⊃ border ⊃ padding ⊃ content. Viewport px. */
export interface BoxLayers {
  margin: Rect
  border: Rect
  padding: Rect
  content: Rect
}

function positive(value: number): number {
  return Math.max(0, value)
}

function shrink(rect: Rect, edges: Edges): Rect {
  const left = positive(edges.left)
  const top = positive(edges.top)
  return {
    x: rect.x + left,
    y: rect.y + top,
    w: positive(rect.w - left - positive(edges.right)),
    h: positive(rect.h - top - positive(edges.bottom)),
  }
}

/** Negative margins are drawn as none: a layer cannot have a negative thickness. */
function grow(rect: Rect, edges: Edges): Rect {
  const left = positive(edges.left)
  const top = positive(edges.top)
  return {
    x: rect.x - left,
    y: rect.y - top,
    w: rect.w + left + positive(edges.right),
    h: rect.h + top + positive(edges.bottom),
  }
}

export function boxLayers(box: BoxModel): BoxLayers {
  const padding = shrink(box.border, box.borderWidth)
  return {
    margin: grow(box.border, box.margin),
    border: box.border,
    padding,
    content: shrink(padding, box.padding),
  }
}
