import { describe, expect, it } from 'vitest'
import {
  assignRanks,
  comparePaintKeys,
  createsStackingContext,
  type PaintContext,
  type PaintKey,
  type PaintStyle,
  placeInPaintOrder,
  ROOT_PAINT_CONTEXT,
} from '@/content/snapshot/rank'

const STATIC: PaintStyle = {
  position: 'static',
  'z-index': 'auto',
  opacity: '1',
  transform: 'none',
  filter: 'none',
  'backdrop-filter': 'none',
  isolation: 'auto',
  'mix-blend-mode': 'normal',
  'will-change': 'auto',
  contain: 'none',
  perspective: 'none',
  'clip-path': 'none',
  'mask-image': 'none',
  float: 'none',
}

function style(overrides: Partial<PaintStyle>): PaintStyle {
  return { ...STATIC, ...overrides }
}

/**
 * A tiny tree builder: each box is placed with its parent's context, in document order, and
 * the result is a map name → key, so the assertions read like the DOM they describe.
 */
interface Box {
  name: string
  style?: Partial<PaintStyle>
  display?: string
  children?: Box[]
}

function placeTree(boxes: Box[]): Map<string, PaintKey> {
  const keys = new Map<string, PaintKey>()
  let order = 0
  const visit = (box: Box, context: PaintContext) => {
    order += 1
    const placement = placeInPaintOrder(
      style(box.style ?? {}),
      box.display ?? 'block',
      order,
      context,
    )
    keys.set(box.name, placement.key)
    for (const child of box.children ?? []) visit(child, placement.children)
  }
  for (const box of boxes) visit(box, ROOT_PAINT_CONTEXT)
  return keys
}

function above(keys: Map<string, PaintKey>, top: string, bottom: string) {
  const a = keys.get(top) as PaintKey
  const b = keys.get(bottom) as PaintKey
  expect(comparePaintKeys(a, b), `${top} above ${bottom}`).toBeGreaterThan(0)
  expect(comparePaintKeys(b, a), `${bottom} below ${top}`).toBeLessThan(0)
}

describe('createsStackingContext', () => {
  it.each<[string, Partial<PaintStyle>, boolean]>([
    ['static box', {}, false],
    ['relative without z-index', { position: 'relative' }, false],
    ['relative with z-index', { position: 'relative', 'z-index': '1' }, true],
    ['static with z-index (ignored)', { 'z-index': '1' }, false],
    ['absolute with z-index 0', { position: 'absolute', 'z-index': '0' }, true],
    ['fixed', { position: 'fixed' }, true],
    ['sticky', { position: 'sticky' }, true],
    ['opacity below 1', { opacity: '0.5' }, true],
    ['opacity 1', { opacity: '1' }, false],
    ['transform', { transform: 'matrix(1, 0, 0, 1, 0, 0)' }, true],
    ['filter', { filter: 'blur(2px)' }, true],
    ['backdrop-filter', { 'backdrop-filter': 'blur(2px)' }, true],
    ['isolation', { isolation: 'isolate' }, true],
    ['blend mode', { 'mix-blend-mode': 'multiply' }, true],
    ['contain: paint', { contain: 'paint' }, true],
    ['contain: strict', { contain: 'strict' }, true],
    ['contain: size (no paint)', { contain: 'size' }, false],
    ['perspective', { perspective: '500px' }, true],
    ['clip-path', { 'clip-path': 'inset(0px)' }, true],
    ['mask-image', { 'mask-image': 'url("x.png")' }, true],
    ['will-change: transform', { 'will-change': 'transform' }, true],
    ['will-change: scroll-position', { 'will-change': 'scroll-position' }, false],
  ])('%s', (_name, overrides, expected) => {
    expect(createsStackingContext(style(overrides), false)).toBe(expected)
  })

  it('a flex or grid item with a z-index creates a context without being positioned', () => {
    expect(createsStackingContext(style({ 'z-index': '2' }), true)).toBe(true)
    expect(createsStackingContext(style({ 'z-index': 'auto' }), true)).toBe(false)
  })
})

describe('paint order', () => {
  it('a positioned box earlier in the DOM with a higher z-index stays above later static content', () => {
    const keys = placeTree([
      { name: 'high', style: { position: 'relative', 'z-index': '5' } },
      { name: 'later', children: [{ name: 'later-text' }] },
    ])
    above(keys, 'high', 'later')
    above(keys, 'high', 'later-text')
  })

  it('a later static sibling paints above an earlier one, and children above their parent', () => {
    const keys = placeTree([{ name: 'a', children: [{ name: 'a-child' }] }, { name: 'b' }])
    above(keys, 'a-child', 'a')
    above(keys, 'b', 'a')
    above(keys, 'b', 'a-child')
  })

  it('a z-index inside a transform context cannot escape it', () => {
    const keys = placeTree([
      {
        name: 'transformed',
        style: { transform: 'matrix(1, 0, 0, 1, 0, 0)' },
        children: [{ name: 'inner', style: { position: 'relative', 'z-index': '9999' } }],
      },
      { name: 'sibling', style: { position: 'relative', 'z-index': '1' } },
    ])
    above(keys, 'sibling', 'inner')
    above(keys, 'inner', 'transformed')
  })

  it('a negative z-index paints above its context root but below the root’s in-flow content', () => {
    const keys = placeTree([
      {
        name: 'root',
        style: { position: 'relative', 'z-index': '0' },
        children: [
          { name: 'negative', style: { position: 'absolute', 'z-index': '-1' } },
          { name: 'content' },
        ],
      },
    ])
    above(keys, 'negative', 'root')
    above(keys, 'content', 'negative')
  })

  it('a negative z-index without a stacking-context parent sinks below later in-flow boxes of the root', () => {
    const keys = placeTree([
      {
        name: 'wrapper',
        children: [{ name: 'sunk', style: { position: 'absolute', 'z-index': '-1' } }],
      },
      { name: 'after' },
    ])
    above(keys, 'after', 'sunk')
    above(keys, 'wrapper', 'sunk')
  })

  it('opacity below 1 groups its subtree: a high z-index inside stays below a later z-index: 1', () => {
    const keys = placeTree([
      {
        name: 'faded',
        style: { opacity: '0.9' },
        children: [{ name: 'inner', style: { position: 'absolute', 'z-index': '100' } }],
      },
      { name: 'later', style: { position: 'relative', 'z-index': '1' } },
    ])
    above(keys, 'later', 'inner')
  })

  it('a fixed header early in the DOM stays above everything static after it', () => {
    const keys = placeTree([
      { name: 'header', style: { position: 'fixed' }, children: [{ name: 'link' }] },
      { name: 'main', children: [{ name: 'card', children: [{ name: 'button' }] }] },
    ])
    above(keys, 'header', 'button')
    above(keys, 'link', 'button')
    above(keys, 'link', 'header')
  })

  it('an auto z-index positioned box carries its in-flow children, but positioned ones escape', () => {
    const keys = placeTree([
      {
        name: 'relative',
        style: { position: 'relative' },
        children: [
          { name: 'static-child' },
          { name: 'positioned-child', style: { position: 'absolute' } },
        ],
      },
      { name: 'later-positioned', style: { position: 'relative' } },
      { name: 'later-static' },
    ])
    above(keys, 'static-child', 'relative')
    // Layer 4 beats layer 2 whatever the document order.
    above(keys, 'relative', 'later-static')
    above(keys, 'static-child', 'later-static')
    // Both are layer 4 of the root context: document order decides.
    above(keys, 'later-positioned', 'positioned-child')
    above(keys, 'positioned-child', 'static-child')
  })

  it('floats sit between in-flow content and positioned boxes', () => {
    const keys = placeTree([
      { name: 'floated', style: { float: 'left' } },
      { name: 'flow' },
      { name: 'positioned', style: { position: 'relative' } },
    ])
    above(keys, 'floated', 'flow')
    above(keys, 'positioned', 'floated')
  })

  it('flex items order by z-index without position', () => {
    const keys = placeTree([
      {
        name: 'flex',
        display: 'flex',
        children: [
          { name: 'item-high', style: { 'z-index': '3' } },
          { name: 'item-plain' },
          { name: 'item-low', style: { 'z-index': '1' } },
        ],
      },
    ])
    above(keys, 'item-high', 'item-low')
    above(keys, 'item-low', 'item-plain')
  })

  it('compares nested contexts lexicographically and prefers the descendant on a prefix', () => {
    const a: PaintKey = [{ layer: 5, z: 1, order: 1 }]
    const aChild: PaintKey = [
      { layer: 5, z: 1, order: 1 },
      { layer: 1, z: -5, order: 2 },
    ]
    const b: PaintKey = [{ layer: 5, z: 2, order: 9 }]
    expect(comparePaintKeys(aChild, a)).toBeGreaterThan(0)
    expect(comparePaintKeys(b, aChild)).toBeGreaterThan(0)
    expect(comparePaintKeys(a, a)).toBe(0)
  })

  it('assigns integer ranks in paint order', () => {
    const keys: PaintKey[] = [
      [{ layer: 2, z: 0, order: 3 }],
      [{ layer: 5, z: 1, order: 1 }],
      [{ layer: 2, z: 0, order: 2 }],
    ]
    expect(assignRanks(keys)).toEqual([1, 2, 0])
    expect(assignRanks([])).toEqual([])
  })
})
