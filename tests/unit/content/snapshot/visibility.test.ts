import { describe, expect, it } from 'vitest'
import {
  type CornerRadii,
  childClipContext,
  clipFor,
  clipsOverflow,
  containsFixed,
  hasRoundedCorners,
  initialClipContext,
  intersectRects,
  paddingBox,
  rectContainsPoint,
  renderability,
  resolveCornerRadius,
  roundedRectContainsPoint,
  skipsChildren,
  type VisibilityStyle,
} from '@/content/snapshot/visibility'

const VISIBLE: VisibilityStyle = {
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  'content-visibility': 'visible',
  'pointer-events': 'auto',
  'overflow-x': 'visible',
  'overflow-y': 'visible',
  contain: 'none',
  position: 'static',
  transform: 'none',
  filter: 'none',
  'backdrop-filter': 'none',
  perspective: 'none',
  'will-change': 'auto',
}

const viewport = { x: 0, y: 0, w: 1280, h: 720 }
const noBorders = { top: 0, right: 0, bottom: 0, left: 0 }

function style(overrides: Partial<VisibilityStyle>): VisibilityStyle {
  return { ...VISIBLE, ...overrides }
}

describe('geometry', () => {
  it('intersects rects and reports an empty intersection as null', () => {
    expect(
      intersectRects({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 }),
    ).toEqual({ x: 50, y: 50, w: 50, h: 50 })
    expect(
      intersectRects({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 10, h: 10 }),
    ).toBeNull()
    expect(intersectRects({ x: 0, y: 0, w: 0, h: 100 }, viewport)).toBeNull()
  })

  it('contains points on the top-left edge but not on the bottom-right one', () => {
    const rect = { x: 10, y: 10, w: 20, h: 20 }
    expect(rectContainsPoint(rect, 10, 10)).toBe(true)
    expect(rectContainsPoint(rect, 29.9, 29.9)).toBe(true)
    expect(rectContainsPoint(rect, 30, 10)).toBe(false)
    expect(rectContainsPoint(rect, 9, 10)).toBe(false)
  })

  it('shrinks the border box to the padding box, never below zero', () => {
    expect(
      paddingBox({ x: 10, y: 10, w: 100, h: 50 }, { top: 2, right: 4, bottom: 2, left: 4 }),
    ).toEqual({ x: 14, y: 12, w: 92, h: 46 })
    expect(
      paddingBox({ x: 0, y: 0, w: 4, h: 4 }, { top: 3, right: 3, bottom: 3, left: 3 }),
    ).toEqual({ x: 3, y: 3, w: 0, h: 0 })
  })
})

describe('clipping', () => {
  it('clips to the padding box of an overflow box, for in-flow children only', () => {
    const scroller = { x: 100, y: 100, w: 300, h: 200 }
    const borders = { top: 1, right: 1, bottom: 1, left: 1 }
    const context = initialClipContext(viewport)
    const own = clipFor(VISIBLE, context)
    const next = childClipContext(style({ 'overflow-y': 'auto' }), scroller, borders, context, own)

    expect(next.flow).toEqual({ x: 101, y: 101, w: 298, h: 198 })
    // A static scroller is not the containing block of absolute or fixed descendants.
    expect(next.absolute).toEqual(viewport)
    expect(next.fixed).toEqual(viewport)
    expect(clipFor(style({ position: 'absolute' }), next)).toEqual(viewport)
    expect(clipFor(style({ position: 'fixed' }), next)).toEqual(viewport)
    expect(clipFor(style({ position: 'relative' }), next)).toEqual(next.flow)
  })

  it('a positioned overflow box clips its absolute descendants too', () => {
    const box = { x: 0, y: 0, w: 100, h: 100 }
    const context = initialClipContext(viewport)
    const next = childClipContext(
      style({ 'overflow-x': 'hidden', position: 'relative' }),
      box,
      noBorders,
      context,
      viewport,
    )
    expect(next.absolute).toEqual(box)
    expect(next.fixed).toEqual(viewport)
  })

  it('a transformed box becomes the containing block of fixed descendants', () => {
    const box = { x: 0, y: 0, w: 100, h: 100 }
    const context = initialClipContext(viewport)
    const next = childClipContext(
      style({ transform: 'matrix(1, 0, 0, 1, 0, 0)', overflow: 'hidden' } as never),
      box,
      noBorders,
      context,
      viewport,
    )
    expect(next.fixed).toEqual(viewport)
    const clipped = childClipContext(
      style({ transform: 'matrix(1, 0, 0, 1, 0, 0)', 'overflow-x': 'clip' }),
      box,
      noBorders,
      context,
      viewport,
    )
    expect(clipped.fixed).toEqual(box)
    expect(clipped.absolute).toEqual(box)
  })

  it('narrows the clip down the tree and keeps an already clipped-out subtree empty', () => {
    const context = initialClipContext(viewport)
    const outer = childClipContext(
      style({ 'overflow-x': 'hidden' }),
      { x: 0, y: 0, w: 200, h: 200 },
      noBorders,
      context,
      viewport,
    )
    const inner = childClipContext(
      style({ 'overflow-x': 'hidden' }),
      { x: 150, y: 150, w: 200, h: 200 },
      noBorders,
      outer,
      outer.flow,
    )
    expect(inner.flow).toEqual({ x: 150, y: 150, w: 50, h: 50 })
    const gone = childClipContext(
      style({ 'overflow-x': 'hidden' }),
      { x: 500, y: 500, w: 10, h: 10 },
      noBorders,
      inner,
      inner.flow,
    )
    expect(gone.flow).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('recognizes what clips and what contains fixed boxes', () => {
    expect(clipsOverflow(VISIBLE)).toBe(false)
    expect(clipsOverflow(style({ 'overflow-y': 'scroll' }))).toBe(true)
    expect(clipsOverflow(style({ contain: 'paint' }))).toBe(true)
    expect(clipsOverflow(style({ contain: 'size layout' }))).toBe(false)
    expect(containsFixed(VISIBLE)).toBe(false)
    expect(containsFixed(style({ filter: 'blur(1px)' }))).toBe(true)
    expect(containsFixed(style({ contain: 'layout' }))).toBe(true)
    expect(containsFixed(style({ 'will-change': 'transform' }))).toBe(true)
    expect(containsFixed(style({ 'will-change': 'opacity' }))).toBe(false)
  })
})

describe('renderability', () => {
  const rect = { x: 10, y: 10, w: 100, h: 50 }

  it('skips display: none and a fully transparent box', () => {
    expect(renderability(style({ display: 'none' }), rect, rect)).toBe('skip')
    expect(renderability(style({ opacity: '0' }), rect, rect)).toBe('skip')
    expect(renderability(style({ opacity: '0.01' }), rect, rect)).toBe('hittable')
  })

  it('keeps hidden, pointer-transparent, empty and clipped boxes for the tree only', () => {
    expect(renderability(style({ visibility: 'hidden' }), rect, rect)).toBe('tree')
    expect(renderability(style({ visibility: 'collapse' }), rect, rect)).toBe('tree')
    expect(renderability(style({ 'pointer-events': 'none' }), rect, rect)).toBe('tree')
    expect(renderability(VISIBLE, { ...rect, w: 0 }, null)).toBe('tree')
    expect(renderability(style({ display: 'contents' }), { x: 0, y: 0, w: 0, h: 0 }, null)).toBe(
      'tree',
    )
    expect(renderability(VISIBLE, rect, null)).toBe('tree')
  })

  it('a visible box inside the viewport is hittable', () => {
    expect(renderability(VISIBLE, rect, rect)).toBe('hittable')
  })

  it('content-visibility: hidden cuts the subtree but keeps the box', () => {
    expect(skipsChildren(style({ 'content-visibility': 'hidden' }))).toBe(true)
    expect(skipsChildren(style({ 'content-visibility': 'auto' }))).toBe(false)
    expect(renderability(style({ 'content-visibility': 'hidden' }), rect, rect)).toBe('hittable')
  })
})

describe('rounded corners', () => {
  const box = { x: 100, y: 100, w: 140, h: 60 }
  const r = (value?: string) => resolveCornerRadius(value, box)

  it('resolves px, percentages and elliptical radii against the box', () => {
    expect(r('8px')).toEqual({ rx: 8, ry: 8 })
    expect(r('50%')).toEqual({ rx: 70, ry: 30 })
    expect(r('8px 4px')).toEqual({ rx: 8, ry: 4 })
    expect(r('0px')).toEqual({ rx: 0, ry: 0 })
    expect(r(undefined)).toEqual({ rx: 0, ry: 0 })
    expect(hasRoundedCorners([r('0px'), r('0px'), r('0px'), r('0px')])).toBe(false)
    expect(hasRoundedCorners([r('0px'), r('8px'), r('0px'), r('0px')])).toBe(true)
  })

  it('an ellipse (50%) misses its corners and hits its middle', () => {
    const radii: CornerRadii = [r('50%'), r('50%'), r('50%'), r('50%')]
    expect(roundedRectContainsPoint(box, radii, 170, 130)).toBe(true)
    expect(roundedRectContainsPoint(box, radii, 102, 102)).toBe(false)
    expect(roundedRectContainsPoint(box, radii, 237, 158)).toBe(false)
    expect(roundedRectContainsPoint(box, radii, 170, 101)).toBe(true)
    expect(roundedRectContainsPoint(box, radii, 101, 130)).toBe(true)
    expect(roundedRectContainsPoint(box, radii, 300, 130)).toBe(false)
  })

  it('a small radius cuts only the corner pixels; a square box keeps them', () => {
    const rounded: CornerRadii = [r('8px'), r('8px'), r('8px'), r('8px')]
    expect(roundedRectContainsPoint(box, rounded, 100, 100)).toBe(false)
    expect(roundedRectContainsPoint(box, rounded, 104, 104)).toBe(true)
    expect(roundedRectContainsPoint(box, rounded, 107, 107)).toBe(true)
    const oneCorner: CornerRadii = [r('0px'), r('0px'), r('20px'), r('0px')]
    expect(roundedRectContainsPoint(box, oneCorner, 100, 100)).toBe(true)
    expect(roundedRectContainsPoint(box, oneCorner, 238, 158)).toBe(false)
  })

  it('scales radii that would overlap, like CSS', () => {
    const huge: CornerRadii = [r('200px'), r('200px'), r('200px'), r('200px')]
    // Scaled to 70 × 30: the box becomes an ellipse again.
    expect(roundedRectContainsPoint(box, huge, 170, 130)).toBe(true)
    expect(roundedRectContainsPoint(box, huge, 102, 102)).toBe(false)
  })
})
