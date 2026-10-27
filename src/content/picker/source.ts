import type { Rect } from '@/shared/model'

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

/** One breadcrumb: `tag#id.class.class` with hashed classes already filtered out. */
export interface PathEntry {
  node: PickNode
  tag: string
  id: string | null
  classes: string[]
}

/** Computed properties a source captures per node: the tooltip and the report are built from these. */
export const STYLE_PROPS = [
  // typography
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration-line',
  // colors
  'color',
  'background-color',
  'opacity',
  // border
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-top-color',
  // spacing
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  // size
  'width',
  'height',
  'display',
  'box-sizing',
  // radius and shadow
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'box-shadow',
] as const

export type StyleProp = (typeof STYLE_PROPS)[number]

export interface NodeStyles {
  /** Root font size in px at capture time — the base for `rem` values in the tooltip. */
  rootFontSize: number
  values: Record<StyleProp, string>
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
  selectorOf(node: PickNode): string
  /** Breadcrumbs from `<body>` down to the node. */
  pathOf(node: PickNode): PathEntry[]
  /**
   * Viewport regions where the page would swallow pointer events (iframes, plugins): the picker
   * covers them with transparent shields while active so the frame can be hovered and locked as
   * a whole (spec F3.7). Empty for a snapshot — an image swallows nothing.
   */
  shieldRects(): Rect[]
  dispose(): void
}
