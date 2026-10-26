import { describe, expect, it } from 'vitest'
import { clampToViewport, defaultToolbarPosition } from '@/content/position'

const toolbar = { w: 388, h: 60 }
const viewport = { w: 1280, h: 720 }

describe('toolbar position', () => {
  it('defaults to the top-right corner with a 16 px inset', () => {
    expect(defaultToolbarPosition(toolbar, viewport)).toEqual({ x: 1280 - 388 - 16, y: 16 })
  })

  it('clamps a dragged position inside the viewport', () => {
    expect(clampToViewport({ x: -40, y: -10 }, toolbar, viewport)).toEqual({ x: 0, y: 0 })
    expect(clampToViewport({ x: 5000, y: 5000 }, toolbar, viewport)).toEqual({
      x: 1280 - 388,
      y: 720 - 60,
    })
    expect(clampToViewport({ x: 100, y: 100 }, toolbar, viewport)).toEqual({ x: 100, y: 100 })
  })

  it('respects a margin and never goes negative in a tiny viewport', () => {
    expect(clampToViewport({ x: 0, y: 0 }, toolbar, viewport, 8)).toEqual({ x: 8, y: 8 })
    expect(clampToViewport({ x: 300, y: 300 }, toolbar, { w: 200, h: 40 })).toEqual({ x: 0, y: 0 })
  })
})
