import type { Rect, TooltipField } from '@/shared/model'

/**
 * The picker never touches the DOM directly. It reads from a `PickSource`: the live page
 * (`live.ts`) or a frozen snapshot (feature `page-snapshot`). Highlight, tooltip, Locked state,
 * arrow navigation and breadcrumbs work on this interface only, so both sources behave the same.
 */

/** Opaque handle to a node of one source. A source hands out one object per node: compare with `===`. */
export interface PickNode {
  readonly key: string
}

export interface Edges {
  top: number
  right: number
  bottom: number
  left: number
}

/** Border box in viewport px plus the three edge sets DevTools draws around it. */
export interface BoxModel {
  border: Rect
  margin: Edges
  borderWidth: Edges
  padding: Edges
}

/** Elements that never render: both sources skip them with their subtree, like text nodes. */
export const NON_RENDERED_TAGS = new Set([
  'head',
  'title',
  'base',
  'meta',
  'link',
  'style',
  'script',
  'template',
  'noscript',
])

/**
 * Leaves of both sources: their contents are another document (frames, plugins) or drawing
 * commands (`svg`). The picker lands on the element as a whole; `↓` has nowhere to go.
 */
export const LEAF_TAGS = new Set(['iframe', 'frame', 'object', 'embed', 'svg'])

/**
 * The selector of a node and where it came from: `live` — computed from the element in the
 * document (finder); `snapshot` — built from what the snapshot remembered about the element and
 * its ancestors, because the element is gone from the document.
 */
export interface NodeSelector {
  selector: string
  source: 'live' | 'snapshot'
}

/** One breadcrumb: `tag#id.class.class` with hashed classes already filtered out. */
export interface PathEntry {
  node: PickNode
  tag: string
  id: string | null
  classes: string[]
}

/**
 * Computed properties every source captures for every node, whatever the tooltip settings: the
 * box-model highlight, the Locked frame (corner radii), the content row and the report need them.
 */
export const REQUIRED_STYLE_PROPS = [
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'width',
  'height',
  'display',
  'box-sizing',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
] as const

/**
 * Properties behind each tooltip field (settings 3.10). The live source reads them all; a
 * snapshot reads only the enabled fields' groups at capture time — a field enabled later shows
 * `—` until the snapshot is taken again. Spacing and size need nothing beyond the required set.
 */
export const STYLE_PROPS_BY_FIELD = {
  typography: [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-transform',
    'text-decoration-line',
  ],
  colors: ['color', 'background-color', 'opacity', 'border-top-style', 'border-top-color'],
  spacing: [],
  size: [],
  radius: ['box-shadow'],
} as const satisfies Record<TooltipField, readonly string[]>

/** Every property a source may capture; the tooltip and the report are built from these. */
export const STYLE_PROPS = [
  ...REQUIRED_STYLE_PROPS,
  ...STYLE_PROPS_BY_FIELD.typography,
  ...STYLE_PROPS_BY_FIELD.colors,
  ...STYLE_PROPS_BY_FIELD.radius,
] as const

export type StyleProp = (typeof STYLE_PROPS)[number]

/** The required properties plus the groups of the given fields, each once. */
export function stylePropsFor(fields: readonly TooltipField[]): StyleProp[] {
  const props = new Set<StyleProp>(REQUIRED_STYLE_PROPS)
  for (const field of fields) {
    for (const property of STYLE_PROPS_BY_FIELD[field]) props.add(property)
  }
  return [...props]
}

export interface NodeStyles {
  /** Root font size in px at capture time — the base for `rem` values in the tooltip. */
  rootFontSize: number
  /** A property that was not captured is absent (`undefined`), never an empty string. */
  values: Partial<Record<StyleProp, string>>
}

export interface PickSource {
  readonly kind: 'live' | 'snapshot'
  /**
   * Topmost pickable node at a viewport point. Our own overlay host is skipped; open shadow roots
   * are entered, closed ones and iframes stop at the host / frame element. `null` outside the
   * document.
   */
  hitTest(x: number, y: number): PickNode | null
  /** Border box in viewport px, like `getBoundingClientRect`. */
  rectOf(node: PickNode): Rect
  boxModelOf(node: PickNode): BoxModel
  stylesOf(node: PickNode): NodeStyles
  /** `null` on `<body>`: the arrow keys never leave it (spec 3.3 AC). */
  parentOf(node: PickNode): PickNode | null
  firstChildOf(node: PickNode): PickNode | null
  previousSiblingOf(node: PickNode): PickNode | null
  nextSiblingOf(node: PickNode): PickNode | null
  /** Short unique selector for the report; `host >>> inner` through open shadow roots. */
  selectorOf(node: PickNode): NodeSelector
  /** Breadcrumbs from `<body>` down to the node. */
  pathOf(node: PickNode): PathEntry[]
  /**
   * Viewport regions where the page would swallow pointer events (iframes, plugins): the picker
   * covers them with transparent shields while active so the frame can be hovered and locked as
   * a whole (spec F3.7). A snapshot returns the whole viewport: every click and drag lands on
   * our layer and reaches the tools through the same shields, nothing reaches the page.
   */
  shieldRects(): Rect[]
  dispose(): void
}
