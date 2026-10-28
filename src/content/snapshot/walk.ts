import {
  type Edges,
  LEAF_TAGS,
  NON_RENDERED_TAGS,
  type StyleProp,
  stylePropsFor,
} from '@/content/picker/source'
import type { Rect, TooltipField } from '@/shared/model'
import { describeElement, type NodeDescriptor } from './descriptor'
import {
  assignRanks,
  PAINT_STYLE_PROPS,
  type PaintContext,
  type PaintKey,
  type PaintStyle,
  placeInPaintOrder,
  ROOT_PAINT_CONTEXT,
} from './rank'
import {
  type ClipContext,
  type CornerRadii,
  childClipContext,
  clipFor,
  clipsOverflow,
  hasRoundedCorners,
  initialClipContext,
  intersectRects,
  renderability,
  resolveCornerRadius,
  skipsChildren,
  VISIBILITY_STYLE_PROPS,
  type VisibilityStyle,
} from './visibility'

const DEFAULT_ROOT_FONT_SIZE = 16

/** A box of the snapshot: geometry, identity, styles and its place in the tree, all frozen. */
export interface SnapshotNode {
  /** `s<order>`: unique within the snapshot. */
  key: string
  /** Document order of the element in the walk; the paint-order tie-breaker. */
  order: number
  parent: SnapshotNode | null
  children: SnapshotNode[]
  descriptor: NodeDescriptor
  /** Border box in viewport px at capture time. */
  rect: Rect
  /** The part of `rect` inside the viewport and every clip; `null` when nothing shows. */
  visibleRect: Rect | null
  /** A hit target; `false` for boxes kept for the arrow keys and breadcrumbs only. */
  hittable: boolean
  /** Resolved corner radii of a hit target with rounded corners; `null` for square ones. */
  radii: CornerRadii | null
  /** Paint order among the hittable boxes, higher paints later; `-1` for tree-only boxes. */
  rank: number
  box: { margin: Edges; borderWidth: Edges; padding: Edges }
  /** Captured computed values: the required set plus the enabled tooltip fields; empty for tree-only boxes. */
  styles: Partial<Record<StyleProp, string>>
  /** The host whose open shadow root contains the node; `>>>` selectors cross here. */
  shadowHost: SnapshotNode | null
  /** The element, for the lazy finder selector only — never for geometry or styles. */
  element: WeakRef<Element>
}

export interface WalkOptions {
  root: Document
  /** Our overlay host: never part of a snapshot. */
  host: Element
  viewport: { w: number; h: number }
  /** Enabled tooltip fields: only their style groups are captured (plus the required set). */
  fields: readonly TooltipField[]
  now?: () => number
}

export interface WalkTimings {
  /** The whole pass, including the style reads below. */
  walkMs: number
  /** Reading the tooltip / report style groups of the hittable boxes. */
  stylesMs: number
  rankMs: number
}

export interface WalkResult {
  /** Every kept box, in document order. */
  nodes: SnapshotNode[]
  /** The hit targets, sorted by `rank`. */
  hittable: SnapshotNode[]
  rootFontSize: number
  /** Elements visited, including those dropped again. */
  visited: number
  timings: WalkTimings
}

type ExtractedStyle = VisibilityStyle & PaintStyle

const EXTRACTED_PROPS = Array.from(
  new Set<keyof ExtractedStyle>([...VISIBILITY_STYLE_PROPS, ...PAINT_STYLE_PROPS]),
)

const BORDER_WIDTH_PROPS = [
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
] as const

const ZERO_EDGES: Edges = { top: 0, right: 0, bottom: 0, left: 0 }

function px(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function edgesOf(values: Partial<Record<StyleProp, string>>, prefix: string, suffix = ''): Edges {
  return {
    top: px(values[`${prefix}-top${suffix}` as StyleProp]),
    right: px(values[`${prefix}-right${suffix}` as StyleProp]),
    bottom: px(values[`${prefix}-bottom${suffix}` as StyleProp]),
    left: px(values[`${prefix}-left${suffix}` as StyleProp]),
  }
}

function rectOf(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
}

/** The children the browser renders: the shadow tree of an open host, the assigned nodes of a slot. */
function renderedChildren(element: Element): ArrayLike<Element> {
  if (element.shadowRoot) return element.shadowRoot.children
  if (element.localName === 'slot') {
    const assigned = (element as HTMLSlotElement).assignedElements({ flatten: true })
    return assigned.length > 0 ? assigned : element.children
  }
  return element.children
}

/**
 * One synchronous pass over the rendered tree (spec F5.4): rect, visibility, clip, paint order and
 * — for the boxes the picker can land on — the computed styles of the enabled tooltip fields.
 * Synchronous on purpose: a snapshot is one instant, and yielding between subtrees would mix
 * frames (an animation, a re-render) into one picture. Nothing is written to the DOM during the
 * pass, so there is one style recalc at most. Returns the kept boxes with integer ranks.
 */
export function walkSnapshot({
  root,
  host,
  viewport,
  fields,
  now = () => performance.now(),
}: WalkOptions): WalkResult {
  const started = now()
  const win = root.defaultView ?? window
  const viewportRect: Rect = { x: 0, y: 0, w: viewport.w, h: viewport.h }
  const styleProps = stylePropsFor(fields)
  const nodes: SnapshotNode[] = []
  const hittable: SnapshotNode[] = []
  const keys: PaintKey[] = []
  let order = 0
  let visited = 0
  let stylesMs = 0

  const readExtracted = (computed: CSSStyleDeclaration): ExtractedStyle => {
    const values = {} as ExtractedStyle
    for (const property of EXTRACTED_PROPS) values[property] = computed.getPropertyValue(property)
    return values
  }

  const readStyles = (
    computed: CSSStyleDeclaration,
    props: readonly StyleProp[],
  ): Partial<Record<StyleProp, string>> => {
    const values: Partial<Record<StyleProp, string>> = {}
    for (const property of props) values[property] = computed.getPropertyValue(property)
    return values
  }

  const visit = (
    element: Element,
    parent: SnapshotNode | null,
    shadowHost: SnapshotNode | null,
    paint: PaintContext,
    clip: ClipContext,
    nthOfType: number,
    hasSameTagSiblings: boolean,
  ): SnapshotNode | null => {
    if (element === host || NON_RENDERED_TAGS.has(element.localName)) return null
    visited += 1
    const computed = win.getComputedStyle(element)
    if (computed.getPropertyValue('display') === 'none') return null
    order += 1

    const extracted = readExtracted(computed)
    const rect = rectOf(element)
    const ownClip = clipFor(extracted, clip)
    const visibleRect = intersectRects(rect, ownClip)
    const renders = renderability(extracted, rect, visibleRect)
    if (renders === 'skip') return null

    const isHittable = renders === 'hittable'
    let styles: Partial<Record<StyleProp, string>> = {}
    if (isHittable) {
      const stylesStarted = now()
      styles = readStyles(computed, styleProps)
      stylesMs += now() - stylesStarted
    } else if (clipsOverflow(extracted)) {
      styles = readStyles(computed, BORDER_WIDTH_PROPS)
    }
    const borderWidth =
      isHittable || clipsOverflow(extracted) ? edgesOf(styles, 'border', '-width') : ZERO_EDGES

    const placement = placeInPaintOrder(extracted, extracted.display, order, paint)
    const radii: CornerRadii = [
      resolveCornerRadius(styles['border-top-left-radius'], rect),
      resolveCornerRadius(styles['border-top-right-radius'], rect),
      resolveCornerRadius(styles['border-bottom-right-radius'], rect),
      resolveCornerRadius(styles['border-bottom-left-radius'], rect),
    ]
    const node: SnapshotNode = {
      key: `s${order}`,
      order,
      parent,
      children: [],
      descriptor: describeElement(element, nthOfType, hasSameTagSiblings),
      rect,
      visibleRect,
      hittable: isHittable,
      radii: isHittable && hasRoundedCorners(radii) ? radii : null,
      rank: -1,
      box: isHittable
        ? { margin: edgesOf(styles, 'margin'), borderWidth, padding: edgesOf(styles, 'padding') }
        : { margin: ZERO_EDGES, borderWidth, padding: ZERO_EDGES },
      styles,
      shadowHost,
      element: new WeakRef(element),
    }

    if (!LEAF_TAGS.has(element.localName) && !skipsChildren(extracted)) {
      const childClip = childClipContext(extracted, rect, borderWidth, clip, ownClip)
      const childShadowHost = element.shadowRoot ? node : shadowHost
      visitChildren(renderedChildren(element), node, childShadowHost, placement.children, childClip)
    }

    // A box kept for the tree alone earns its place only through what is under it.
    if (!isHittable && node.children.length === 0) return null

    nodes.push(node)
    if (isHittable) {
      hittable.push(node)
      keys.push(placement.key)
    }
    return node
  }

  const visitChildren = (
    children: ArrayLike<Element>,
    parent: SnapshotNode | null,
    shadowHost: SnapshotNode | null,
    paint: PaintContext,
    clip: ClipContext,
  ) => {
    // `:nth-of-type` counts every element sibling of the tag, rendered or not.
    const totals = new Map<string, number>()
    for (let index = 0; index < children.length; index += 1) {
      const tag = (children[index] as Element).localName
      totals.set(tag, (totals.get(tag) ?? 0) + 1)
    }
    const seen = new Map<string, number>()
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index] as Element
      const nth = (seen.get(child.localName) ?? 0) + 1
      seen.set(child.localName, nth)
      const node = visit(
        child,
        parent,
        shadowHost,
        paint,
        clip,
        nth,
        (totals.get(child.localName) ?? 1) > 1,
      )
      if (node && parent) parent.children.push(node)
    }
  }

  visit(
    root.documentElement,
    null,
    null,
    ROOT_PAINT_CONTEXT,
    initialClipContext(viewportRect),
    1,
    false,
  )
  // Boxes are pushed after their subtree (post-order): restore document order.
  nodes.sort((a, b) => a.order - b.order)

  const rankStarted = now()
  const ranks = assignRanks(keys)
  hittable.forEach((node, index) => {
    node.rank = ranks[index] as number
  })
  hittable.sort((a, b) => a.rank - b.rank)
  const rankMs = now() - rankStarted

  const rootFontSize =
    px(win.getComputedStyle(root.documentElement).getPropertyValue('font-size')) ||
    DEFAULT_ROOT_FONT_SIZE

  return {
    nodes,
    hittable,
    rootFontSize,
    visited,
    timings: { walkMs: now() - started, stylesMs, rankMs },
  }
}

/** The descriptors from the tree root (below `body` / the shadow root) down to the node. */
export function descriptorChain(node: SnapshotNode): NodeDescriptor[] {
  const chain: NodeDescriptor[] = []
  for (
    let current: SnapshotNode | null = node;
    current && current.shadowHost === node.shadowHost;
    current = current.parent
  ) {
    if (current.descriptor.tag === 'body' || current.descriptor.tag === 'html') {
      if (current === node) chain.unshift(current.descriptor)
      break
    }
    chain.unshift(current.descriptor)
  }
  return chain
}
