/**
 * Paint order of the boxes in a snapshot, so `hitTest(x, y)` can answer "which node is on top"
 * without the live DOM. A simplified CSS 2.1 Appendix E: every node gets a key that sorts the
 * way the browser paints, and one sort turns the keys into integer ranks.
 *
 * Pure functions over strings read from `getComputedStyle`: the walk (walk.ts) extracts them,
 * unit tests feed them directly — jsdom has no stacking contexts to observe.
 */

/** Computed values that decide where a box paints. Keys are CSS property names. */
export const PAINT_STYLE_PROPS = [
  'position',
  'z-index',
  'opacity',
  'transform',
  'filter',
  'backdrop-filter',
  'isolation',
  'mix-blend-mode',
  'will-change',
  'contain',
  'perspective',
  'clip-path',
  'mask-image',
  'float',
] as const

export type PaintStyleProp = (typeof PAINT_STYLE_PROPS)[number]
export type PaintStyle = Record<PaintStyleProp, string>

const FLEX_OR_GRID = new Set(['flex', 'inline-flex', 'grid', 'inline-grid'])
/** `contain` values that create a stacking context and clip (`paint` is part of `strict`/`content`). */
const CONTAIN_PAINT = /\b(paint|strict|content)\b/
/** `will-change` lists properties; a hint for one of these promotes the box like the property would. */
const WILL_CHANGE_STACKING = new Set([
  'transform',
  'opacity',
  'filter',
  'backdrop-filter',
  'perspective',
  'z-index',
  'isolation',
  'mix-blend-mode',
  'clip-path',
  'mask-image',
  'mask',
  'contain',
  'position',
])

/** The comma-separated idents of a `will-change` value. */
export function willChangeTokens(value: string): string[] {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '')
}

export function isFlexOrGrid(display: string): boolean {
  return FLEX_OR_GRID.has(display)
}

function isSet(value: string): boolean {
  return value !== '' && value !== 'none' && value !== 'normal'
}

/** Whether `z-index` applies at all: it is ignored on static, non-flex/grid boxes. */
export function zIndexApplies(style: PaintStyle, parentIsFlexOrGrid: boolean): boolean {
  return style['z-index'] !== 'auto' && (style.position !== 'static' || parentIsFlexOrGrid)
}

export function zIndexOf(style: PaintStyle, parentIsFlexOrGrid: boolean): number {
  if (!zIndexApplies(style, parentIsFlexOrGrid)) return 0
  const value = Number.parseInt(style['z-index'], 10)
  return Number.isFinite(value) ? value : 0
}

/**
 * The stacking-context rules of CSS Positioned Layout 3 and Compositing: an integer `z-index` on
 * a positioned or flex/grid box, `fixed` / `sticky`, `opacity` below 1, any transform, filter,
 * backdrop-filter, perspective, clip-path or mask, `isolation: isolate`, a blend mode,
 * `contain: paint`, and `will-change` naming any of those.
 */
export function createsStackingContext(style: PaintStyle, parentIsFlexOrGrid: boolean): boolean {
  if (zIndexApplies(style, parentIsFlexOrGrid)) return true
  if (style.position === 'fixed' || style.position === 'sticky') return true
  const opacity = Number.parseFloat(style.opacity)
  if (Number.isFinite(opacity) && opacity < 1) return true
  if (isSet(style.transform) || isSet(style.filter) || isSet(style['backdrop-filter'])) return true
  if (isSet(style.perspective) || isSet(style['clip-path']) || isSet(style['mask-image'])) {
    return true
  }
  if (style.isolation === 'isolate') return true
  if (style['mix-blend-mode'] !== 'normal' && style['mix-blend-mode'] !== '') return true
  if (CONTAIN_PAINT.test(style.contain)) return true
  return willChangeTokens(style['will-change']).some((token) => WILL_CHANGE_STACKING.has(token))
}

/**
 * Where a box paints inside its stacking context (Appendix E, steps collapsed):
 * 1 — child stacking contexts with a negative `z-index`;
 * 2 — in-flow, non-positioned, non-floated boxes (backgrounds and inline content as one layer);
 * 3 — floats;
 * 4 — positioned boxes with `z-index: auto` and stacking contexts with `z-index: 0`;
 * 5 — child stacking contexts with a positive `z-index`.
 */
export type PaintLayer = 1 | 2 | 3 | 4 | 5

export interface PaintStep {
  layer: PaintLayer
  /** The `z-index` for layers 1 and 5, `0` elsewhere. */
  z: number
  /** Document order of the box, the tie-breaker: later paints above. */
  order: number
}

/** One step per enclosing paint group from the root down to the box itself. */
export type PaintKey = readonly PaintStep[]

/**
 * What the children of a box inherit. `stacking` is the key of the nearest real stacking
 * context — the prefix of every positioned descendant and nested context. `group` is the key of
 * the nearest paint group: a stacking context, or a positioned box with `z-index: auto`, whose
 * in-flow descendants paint together with it (Appendix E treats such a box as a context for its
 * non-positioned content only).
 */
export interface PaintContext {
  stacking: PaintKey
  group: PaintKey
  parentIsFlexOrGrid: boolean
}

export const ROOT_PAINT_CONTEXT: PaintContext = {
  stacking: [],
  group: [],
  parentIsFlexOrGrid: false,
}

export interface PaintPlacement {
  key: PaintKey
  stackingContext: boolean
  /** Context for the box's children. */
  children: PaintContext
}

export function placeInPaintOrder(
  style: PaintStyle,
  display: string,
  order: number,
  context: PaintContext,
): PaintPlacement {
  const positioned = style.position !== 'static'
  const stackingContext = createsStackingContext(style, context.parentIsFlexOrGrid)
  const z = zIndexOf(style, context.parentIsFlexOrGrid)

  let layer: PaintLayer
  if (stackingContext) layer = z < 0 ? 1 : z > 0 ? 5 : 4
  else if (positioned) layer = 4
  else if (style.float !== 'none' && style.float !== '') layer = 3
  else layer = 2

  const prefix = positioned || stackingContext ? context.stacking : context.group
  const key: PaintKey = [...prefix, { layer, z: layer === 1 || layer === 5 ? z : 0, order }]
  const parentIsFlexOrGrid = isFlexOrGrid(display)

  const children: PaintContext = stackingContext
    ? { stacking: key, group: key, parentIsFlexOrGrid }
    : positioned
      ? { stacking: context.stacking, group: key, parentIsFlexOrGrid }
      : { stacking: context.stacking, group: context.group, parentIsFlexOrGrid }

  return { key, stackingContext, children }
}

/**
 * Lexicographic: layer, then z-index, then document order, step by step. When one key is a
 * prefix of the other the longer one — the descendant — is on top: a box always paints above
 * the background of the context it belongs to, even with a negative `z-index`.
 */
export function comparePaintKeys(a: PaintKey, b: PaintKey): number {
  const common = Math.min(a.length, b.length)
  for (let index = 0; index < common; index += 1) {
    const left = a[index] as PaintStep
    const right = b[index] as PaintStep
    if (left.layer !== right.layer) return left.layer - right.layer
    if (left.z !== right.z) return left.z - right.z
    if (left.order !== right.order) return left.order - right.order
  }
  return a.length - b.length
}

/** Integer ranks from the keys: `rank[i]` of `keys[i]`, 0 for the bottom-most box. */
export function assignRanks(keys: readonly PaintKey[]): number[] {
  const indices = keys.map((_, index) => index)
  indices.sort((a, b) => comparePaintKeys(keys[a] as PaintKey, keys[b] as PaintKey))
  const ranks = new Array<number>(keys.length)
  indices.forEach((keyIndex, rank) => {
    ranks[keyIndex] = rank
  })
  return ranks
}
