import type { Edges } from '@/content/picker/source'
import type { Rect } from '@/shared/model'
import { willChangeTokens } from './rank'

/**
 * Which boxes of a page make it into a snapshot and where they can be hit. Pure geometry and
 * string checks over computed values; the walk (walk.ts) feeds it, unit tests feed it directly.
 */

/** Computed values that decide whether a box renders and what it clips. Keys are CSS names. */
export const VISIBILITY_STYLE_PROPS = [
  'display',
  'visibility',
  'opacity',
  'content-visibility',
  'pointer-events',
  'overflow-x',
  'overflow-y',
  'contain',
  'position',
  'transform',
  'filter',
  'backdrop-filter',
  'perspective',
  'will-change',
] as const

export type VisibilityStyleProp = (typeof VISIBILITY_STYLE_PROPS)[number]
export type VisibilityStyle = Record<VisibilityStyleProp, string>

export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.w, b.x + b.w)
  const bottom = Math.min(a.y + a.h, b.y + b.h)
  if (right <= x || bottom <= y) return null
  return { x, y, w: right - x, h: bottom - y }
}

export function rectContainsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
}

/** Horizontal and vertical radius of one corner, px. */
export interface CornerRadius {
  rx: number
  ry: number
}

/** Top-left, top-right, bottom-right, bottom-left. */
export type CornerRadii = [CornerRadius, CornerRadius, CornerRadius, CornerRadius]

const NO_RADIUS: CornerRadius = { rx: 0, ry: 0 }

/**
 * A computed `border-*-radius` resolved against the box: `8px`, `50%` (horizontal against the
 * width, vertical against the height, like CSS) or the elliptical `8px 4px`.
 */
export function resolveCornerRadius(value: string | undefined, box: Rect): CornerRadius {
  if (!value) return NO_RADIUS
  const parts = value.trim().split(/\s+/)
  const resolve = (part: string | undefined, length: number): number => {
    if (!part) return 0
    const number = Number.parseFloat(part)
    if (!Number.isFinite(number) || number <= 0) return 0
    return part.endsWith('%') ? (length * number) / 100 : number
  }
  const rx = resolve(parts[0], box.w)
  const ry = resolve(parts[1] ?? parts[0], box.h)
  return rx > 0 && ry > 0 ? { rx, ry } : NO_RADIUS
}

export function hasRoundedCorners(radii: CornerRadii): boolean {
  return radii.some((corner) => corner.rx > 0 && corner.ry > 0)
}

/**
 * Whether a point of the border box lies inside its rounded shape: the browser hit-tests the
 * shape, so the corner cut off by a radius belongs to whatever is behind. Adjacent radii that
 * would overlap are scaled down together, as CSS does.
 */
export function roundedRectContainsPoint(
  rect: Rect,
  radii: CornerRadii,
  x: number,
  y: number,
): boolean {
  if (!rectContainsPoint(rect, x, y)) return false
  const [tl, tr, br, bl] = radii
  const scale = Math.min(
    1,
    rect.w / Math.max(1, tl.rx + tr.rx),
    rect.w / Math.max(1, bl.rx + br.rx),
    rect.h / Math.max(1, tl.ry + bl.ry),
    rect.h / Math.max(1, tr.ry + br.ry),
  )
  const corners: Array<[CornerRadius, number, number]> = [
    [tl, rect.x + tl.rx * scale, rect.y + tl.ry * scale],
    [tr, rect.x + rect.w - tr.rx * scale, rect.y + tr.ry * scale],
    [br, rect.x + rect.w - br.rx * scale, rect.y + rect.h - br.ry * scale],
    [bl, rect.x + bl.rx * scale, rect.y + rect.h - bl.ry * scale],
  ]
  for (const [corner, cx, cy] of corners) {
    const rx = corner.rx * scale
    const ry = corner.ry * scale
    if (rx <= 0 || ry <= 0) continue
    // Only the quadrant of the corner itself is curved.
    const inCornerBox =
      (corner === tl && x < cx && y < cy) ||
      (corner === tr && x >= cx && y < cy) ||
      (corner === br && x >= cx && y >= cy) ||
      (corner === bl && x < cx && y >= cy)
    if (!inCornerBox) continue
    const dx = (x + 0.5 - cx) / rx
    const dy = (y + 0.5 - cy) / ry
    return dx * dx + dy * dy <= 1
  }
  return true
}

/** The padding box: the border box without its borders. What an overflow box clips to. */
export function paddingBox(rect: Rect, borders: Edges): Rect {
  const left = Math.max(0, borders.left)
  const top = Math.max(0, borders.top)
  return {
    x: rect.x + left,
    y: rect.y + top,
    w: Math.max(0, rect.w - left - Math.max(0, borders.right)),
    h: Math.max(0, rect.h - top - Math.max(0, borders.bottom)),
  }
}

/**
 * Clips a box's children inherit, by their positioning scheme. An `overflow` box clips only the
 * descendants whose containing block chain runs through it: an absolutely positioned descendant
 * of a static scroller escapes it, a fixed one escapes everything but a transformed ancestor.
 */
export interface ClipContext {
  /** In-flow, relative and sticky descendants. */
  flow: Rect
  /** Absolutely positioned descendants: the clip at their containing block. */
  absolute: Rect
  /** Fixed descendants: the viewport, unless an ancestor establishes their containing block. */
  fixed: Rect
}

export function initialClipContext(viewport: Rect): ClipContext {
  return { flow: viewport, absolute: viewport, fixed: viewport }
}

/** The clip that applies to a box, from the context its parent passed down. */
export function clipFor(style: Pick<VisibilityStyle, 'position'>, context: ClipContext): Rect {
  if (style.position === 'fixed') return context.fixed
  if (style.position === 'absolute') return context.absolute
  return context.flow
}

const CONTAIN_PAINT = /\b(paint|strict|content)\b/
const CONTAIN_LAYOUT = /\b(layout|paint|strict|content)\b/
const WILL_CHANGE_CONTAINER = new Set([
  'transform',
  'perspective',
  'filter',
  'backdrop-filter',
  'contain',
])

export function clipsOverflow(
  style: Pick<VisibilityStyle, 'overflow-x' | 'overflow-y' | 'contain'>,
): boolean {
  return (
    (style['overflow-x'] !== 'visible' && style['overflow-x'] !== '') ||
    (style['overflow-y'] !== 'visible' && style['overflow-y'] !== '') ||
    CONTAIN_PAINT.test(style.contain)
  )
}

/** Whether the box is the containing block of its fixed (and absolute) descendants. */
export function containsFixed(style: VisibilityStyle): boolean {
  const set = (value: string) => value !== '' && value !== 'none'
  return (
    set(style.transform) ||
    set(style.filter) ||
    set(style['backdrop-filter']) ||
    set(style.perspective) ||
    CONTAIN_LAYOUT.test(style.contain) ||
    willChangeTokens(style['will-change']).some((token) => WILL_CHANGE_CONTAINER.has(token))
  )
}

/**
 * The clip context for a box's children: the box's own clip, narrowed to its padding box when it
 * clips overflow. A positioned box becomes the containing block of absolute descendants, a
 * transformed one of fixed descendants too.
 */
export function childClipContext(
  style: VisibilityStyle,
  rect: Rect,
  borders: Edges,
  context: ClipContext,
  ownClip: Rect,
): ClipContext {
  let flow = ownClip
  if (clipsOverflow(style)) {
    flow = intersectRects(ownClip, paddingBox(rect, borders)) ?? { x: 0, y: 0, w: 0, h: 0 }
  }
  const fixedContainer = containsFixed(style)
  const positioned = style.position !== 'static'
  return {
    flow,
    absolute: positioned || fixedContainer ? flow : context.absolute,
    fixed: fixedContainer ? flow : context.fixed,
  }
}

/**
 * `skip` — the box and its subtree are not in the snapshot (`display: none`, `opacity: 0`);
 * `tree` — kept for the arrow keys and breadcrumbs only, never a hit target;
 * `hittable` — a visible box the picker can land on.
 */
export type Renderability = 'skip' | 'tree' | 'hittable'

export function renderability(
  style: Pick<VisibilityStyle, 'display' | 'visibility' | 'opacity' | 'pointer-events'>,
  rect: Rect,
  visibleRect: Rect | null,
): Renderability {
  if (style.display === 'none') return 'skip'
  const opacity = Number.parseFloat(style.opacity)
  if (Number.isFinite(opacity) && opacity <= 0) return 'skip'
  if (style.visibility !== 'visible' && style.visibility !== '') return 'tree'
  if (style['pointer-events'] === 'none') return 'tree'
  if (rect.w <= 0 || rect.h <= 0 || !visibleRect) return 'tree'
  return 'hittable'
}

/** Children are never walked below a box whose contents the browser does not render. */
export function skipsChildren(style: Pick<VisibilityStyle, 'content-visibility'>): boolean {
  return style['content-visibility'] === 'hidden'
}
