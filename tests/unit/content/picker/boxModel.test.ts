import { describe, expect, it } from 'vitest'
import { boxLayers } from '@/content/picker/boxModel'

describe('boxLayers', () => {
  it('derives margin, padding and content rectangles from the border box', () => {
    expect(
      boxLayers({
        border: { x: 100, y: 50, w: 200, h: 100 },
        margin: { top: 16, right: 0, bottom: 8, left: 4 },
        borderWidth: { top: 1, right: 1, bottom: 1, left: 1 },
        padding: { top: 10, right: 16, bottom: 10, left: 16 },
      }),
    ).toEqual({
      margin: { x: 96, y: 34, w: 204, h: 124 },
      border: { x: 100, y: 50, w: 200, h: 100 },
      padding: { x: 101, y: 51, w: 198, h: 98 },
      content: { x: 117, y: 61, w: 166, h: 78 },
    })
  })

  it('ignores negative margins and never returns negative sizes', () => {
    const layers = boxLayers({
      border: { x: 10, y: 10, w: 20, h: 10 },
      margin: { top: -8, right: -8, bottom: 4, left: 0 },
      borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 30, right: 30, bottom: 30, left: 30 },
    })
    expect(layers.margin).toEqual({ x: 10, y: 10, w: 20, h: 14 })
    expect(layers.content).toEqual({ x: 40, y: 40, w: 0, h: 0 })
  })
})
