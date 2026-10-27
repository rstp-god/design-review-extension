import { describe, expect, it } from 'vitest'
import {
  type Corner,
  clampPoint,
  clampRect,
  cornerPoint,
  ensureMinSize,
  formatAreaChip,
  isTooSmall,
  MIN_AREA_SIZE,
  NO_MODIFIERS,
  oppositeCorner,
  rectFromDrag,
  resizeFromCorner,
} from '@/content/area/geometry'

const viewport = { w: 1000, h: 800 }
const anchor = { x: 300, y: 200 }
const square = { square: true, fromCenter: false }
const center = { square: false, fromCenter: true }
const both = { square: true, fromCenter: true }

describe('rectFromDrag', () => {
  it('spans the anchor and the pointer in any direction', () => {
    expect(rectFromDrag(anchor, { x: 500, y: 350 }, NO_MODIFIERS, viewport)).toEqual({
      x: 300,
      y: 200,
      w: 200,
      h: 150,
    })
    expect(rectFromDrag(anchor, { x: 100, y: 50 }, NO_MODIFIERS, viewport)).toEqual({
      x: 100,
      y: 50,
      w: 200,
      h: 150,
    })
    expect(rectFromDrag(anchor, { x: 100, y: 350 }, NO_MODIFIERS, viewport)).toEqual({
      x: 100,
      y: 200,
      w: 200,
      h: 150,
    })
    expect(rectFromDrag(anchor, anchor, NO_MODIFIERS, viewport)).toEqual({
      x: 300,
      y: 200,
      w: 0,
      h: 0,
    })
  })

  it('clamps the pointer to the viewport', () => {
    expect(rectFromDrag(anchor, { x: 1500, y: -40 }, NO_MODIFIERS, viewport)).toEqual({
      x: 300,
      y: 0,
      w: 700,
      h: 200,
    })
    expect(rectFromDrag({ x: -10, y: 900 }, { x: 50, y: 700 }, NO_MODIFIERS, viewport)).toEqual({
      x: 0,
      y: 700,
      w: 50,
      h: 100,
    })
  })

  it('Shift: a square of the larger distance, grown in the direction of the pointer', () => {
    expect(rectFromDrag(anchor, { x: 500, y: 250 }, square, viewport)).toEqual({
      x: 300,
      y: 200,
      w: 200,
      h: 200,
    })
    expect(rectFromDrag(anchor, { x: 350, y: 50 }, square, viewport)).toEqual({
      x: 300,
      y: 50,
      w: 150,
      h: 150,
    })
    expect(rectFromDrag(anchor, { x: 200, y: 260 }, square, viewport)).toEqual({
      x: 200,
      y: 200,
      w: 100,
      h: 100,
    })
    expect(rectFromDrag(anchor, { x: 180, y: 80 }, square, viewport)).toEqual({
      x: 180,
      y: 80,
      w: 120,
      h: 120,
    })
    // No movement on one axis grows towards the right / bottom.
    expect(rectFromDrag(anchor, { x: 300, y: 260 }, square, viewport)).toEqual({
      x: 300,
      y: 200,
      w: 60,
      h: 60,
    })
  })

  it('Shift: stays a square at the viewport edge', () => {
    // 1000 - 300 = 700 px of room to the right, 600 below: the side is limited by the room.
    expect(rectFromDrag(anchor, { x: 2000, y: 2000 }, square, viewport)).toEqual({
      x: 300,
      y: 200,
      w: 600,
      h: 600,
    })
    expect(rectFromDrag(anchor, { x: 0, y: 0 }, square, viewport)).toEqual({
      x: 100,
      y: 0,
      w: 200,
      h: 200,
    })
  })

  it('Alt: grows from the center in both directions', () => {
    expect(rectFromDrag(anchor, { x: 400, y: 260 }, center, viewport)).toEqual({
      x: 200,
      y: 140,
      w: 200,
      h: 120,
    })
    expect(rectFromDrag(anchor, { x: 200, y: 140 }, center, viewport)).toEqual({
      x: 200,
      y: 140,
      w: 200,
      h: 120,
    })
  })

  it('Alt: stays centered at the viewport edge', () => {
    // 200 px above the anchor, 300 to the left: the half sizes stop there.
    expect(rectFromDrag(anchor, { x: 900, y: 700 }, center, viewport)).toEqual({
      x: 0,
      y: 0,
      w: 600,
      h: 400,
    })
  })

  it('Shift+Alt: a square from the center, limited by the nearest edge', () => {
    expect(rectFromDrag(anchor, { x: 450, y: 220 }, both, viewport)).toEqual({
      x: 150,
      y: 50,
      w: 300,
      h: 300,
    })
    expect(rectFromDrag(anchor, { x: 900, y: 700 }, both, viewport)).toEqual({
      x: 100,
      y: 0,
      w: 400,
      h: 400,
    })
  })
})

describe('clampPoint / clampRect', () => {
  it('keeps a point inside the viewport', () => {
    expect(clampPoint({ x: -5, y: 900 }, viewport)).toEqual({ x: 0, y: 800 })
    expect(clampPoint({ x: 10, y: 20 }, viewport)).toEqual({ x: 10, y: 20 })
  })

  it('moves a rect back inside and shrinks one larger than the viewport', () => {
    expect(clampRect({ x: 950, y: -20, w: 100, h: 50 }, viewport)).toEqual({
      x: 900,
      y: 0,
      w: 100,
      h: 50,
    })
    expect(clampRect({ x: 10, y: 10, w: 2000, h: 50 }, viewport)).toEqual({
      x: 0,
      y: 10,
      w: 1000,
      h: 50,
    })
  })
})

describe('minimum size', () => {
  it('treats anything under 8 × 8 as a click', () => {
    expect(MIN_AREA_SIZE).toBe(8)
    expect(isTooSmall({ x: 0, y: 0, w: 7.9, h: 100 })).toBe(true)
    expect(isTooSmall({ x: 0, y: 0, w: 100, h: 0 })).toBe(true)
    expect(isTooSmall({ x: 0, y: 0, w: 8, h: 8 })).toBe(false)
  })

  it('grows a released corner away from its anchor up to the minimum', () => {
    // se dragged to 3 × 2: the nw corner stays, the rect grows right and down.
    expect(ensureMinSize({ x: 100, y: 100, w: 3, h: 2 }, 'se', viewport)).toEqual({
      x: 100,
      y: 100,
      w: 8,
      h: 8,
    })
    // nw dragged: the se corner (103, 102) stays.
    expect(ensureMinSize({ x: 100, y: 100, w: 3, h: 2 }, 'nw', viewport)).toEqual({
      x: 95,
      y: 94,
      w: 8,
      h: 8,
    })
    expect(ensureMinSize({ x: 100, y: 100, w: 3, h: 20 }, 'ne', viewport)).toEqual({
      x: 100,
      y: 100,
      w: 8,
      h: 20,
    })
    // At the viewport corner the grown rect is pushed back inside.
    expect(ensureMinSize({ x: 998, y: 798, w: 2, h: 2 }, 'se', viewport)).toEqual({
      x: 992,
      y: 792,
      w: 8,
      h: 8,
    })
    const fine = { x: 10, y: 10, w: 50, h: 40 }
    expect(ensureMinSize(fine, 'sw', viewport)).toBe(fine)
  })
})

describe('corners', () => {
  const rect = { x: 100, y: 200, w: 300, h: 150 }

  it('names the points and the opposites', () => {
    expect(cornerPoint(rect, 'nw')).toEqual({ x: 100, y: 200 })
    expect(cornerPoint(rect, 'ne')).toEqual({ x: 400, y: 200 })
    expect(cornerPoint(rect, 'sw')).toEqual({ x: 100, y: 350 })
    expect(cornerPoint(rect, 'se')).toEqual({ x: 400, y: 350 })
    expect(oppositeCorner('nw')).toBe('se')
    expect(oppositeCorner('se')).toBe('nw')
    expect(oppositeCorner('ne')).toBe('sw')
    expect(oppositeCorner('sw')).toBe('ne')
  })

  it.each<[Corner, { x: number; y: number }, { x: number; y: number; w: number; h: number }]>([
    ['se', { x: 500, y: 400 }, { x: 100, y: 200, w: 400, h: 200 }],
    ['nw', { x: 50, y: 150 }, { x: 50, y: 150, w: 350, h: 200 }],
    ['ne', { x: 450, y: 100 }, { x: 100, y: 100, w: 350, h: 250 }],
    ['sw', { x: 150, y: 300 }, { x: 150, y: 200, w: 250, h: 100 }],
  ])('resizes by the %s handle with the opposite corner fixed', (corner, pointer, expected) => {
    expect(resizeFromCorner(rect, corner, pointer, { square: false }, viewport)).toEqual({
      rect: expected,
      corner,
    })
  })

  it('inverts when a handle is dragged through the opposite corner', () => {
    // nw dragged past se (400, 350): the rect flips and the pointer now holds se.
    expect(resizeFromCorner(rect, 'nw', { x: 450, y: 380 }, { square: false }, viewport)).toEqual({
      rect: { x: 400, y: 350, w: 50, h: 30 },
      corner: 'se',
    })
    // Only horizontally: nw becomes ne.
    expect(resizeFromCorner(rect, 'nw', { x: 420, y: 250 }, { square: false }, viewport)).toEqual({
      rect: { x: 400, y: 250, w: 20, h: 100 },
      corner: 'ne',
    })
    expect(resizeFromCorner(rect, 'se', { x: 60, y: 180 }, { square: false }, viewport)).toEqual({
      rect: { x: 60, y: 180, w: 40, h: 20 },
      corner: 'nw',
    })
  })

  it('keeps a square from the anchor with Shift and never leaves the viewport', () => {
    expect(resizeFromCorner(rect, 'se', { x: 500, y: 250 }, { square: true }, viewport)).toEqual({
      rect: { x: 100, y: 200, w: 400, h: 400 },
      corner: 'se',
    })
    expect(resizeFromCorner(rect, 'se', { x: 1500, y: 900 }, { square: false }, viewport)).toEqual({
      rect: { x: 100, y: 200, w: 900, h: 600 },
      corner: 'se',
    })
  })
})

describe('formatAreaChip', () => {
  it('prints size and position with one decimal at most', () => {
    expect(formatAreaChip({ x: 330, y: 470, w: 620, h: 104 })).toBe('620 × 104 · x 330 y 470')
    expect(formatAreaChip({ x: 10.25, y: 0, w: 99.96, h: 8 })).toBe('100 × 8 · x 10.3 y 0')
  })
})
