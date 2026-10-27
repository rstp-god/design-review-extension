// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { overlaySurfaceAt, rectContains, surfaceProps } from '@/content/overlay/surfaces'

function surface(
  root: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  const element = document.createElement('div')
  const props = surfaceProps('test')
  for (const [name, value] of Object.entries(props)) element.setAttribute(name, value)
  element.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }) as DOMRect
  root.append(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('overlaySurfaceAt', () => {
  it('returns the rect of the marked element under the point, null over the page', () => {
    const root = document.body
    surface(root, { left: 800, top: 16, width: 400, height: 56 })
    surface(root, { left: 0, top: 0, width: 0, height: 0 })
    expect(overlaySurfaceAt(root, 900, 40)).toEqual({ x: 800, y: 16, w: 400, h: 56 })
    expect(overlaySurfaceAt(root, 799, 40)).toBeNull()
    expect(overlaySurfaceAt(root, 1200, 40)).toBeNull()
    expect(overlaySurfaceAt(root, 0, 0)).toBeNull()
  })

  it('ignores elements without the attribute', () => {
    const plain = document.createElement('div')
    plain.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect
    document.body.append(plain)
    expect(overlaySurfaceAt(document.body, 10, 10)).toBeNull()
  })
})

describe('rectContains', () => {
  it('is inclusive at the start and exclusive at the end', () => {
    const rect = { x: 10, y: 20, w: 30, h: 40 }
    expect(rectContains(rect, 10, 20)).toBe(true)
    expect(rectContains(rect, 39, 59)).toBe(true)
    expect(rectContains(rect, 40, 20)).toBe(false)
    expect(rectContains(rect, 10, 60)).toBe(false)
  })
})
