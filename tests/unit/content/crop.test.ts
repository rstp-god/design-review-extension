import { describe, expect, it } from 'vitest'
import { cropGeometry } from '@/content/crop'

describe('crop geometry', () => {
  it('uses bitmap dimensions, independently of DPR', () => {
    expect(
      cropGeometry(
        { x: 10.25, y: 20.5, w: 30, h: 40 },
        { w: 100, h: 100 },
        { width: 200, height: 150 },
        5,
      ),
    ).toEqual({
      pixels: { x: 10, y: 23, w: 81, h: 76 },
      clipped: false,
      marker: { x: 10.5, y: 7.75 },
    })
  })
  it('clips the target and padding at the viewport edge', () => {
    const result = cropGeometry(
      { x: -10, y: 80, w: 30, h: 40 },
      { w: 100, h: 100 },
      { width: 100, height: 100 },
      24,
    )
    expect(result?.pixels).toEqual({ x: 0, y: 56, w: 44, h: 44 })
    expect(result?.clipped).toBe(true)
    expect(
      cropGeometry(
        { x: 101, y: 0, w: 2, h: 2 },
        { w: 100, h: 100 },
        { width: 100, height: 100 },
        0,
      ),
    ).toBeNull()
  })
})
