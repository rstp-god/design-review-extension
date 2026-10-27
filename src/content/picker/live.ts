import type { Rect } from '@/shared/model'
import { isUsableClass, isUsableId } from './classNames'
import { finderSelector, type SelectorGenerator, selectorFor } from './selector'
import {
  type BoxModel,
  type Edges,
  type NodeStyles,
  type PathEntry,
  type PickNode,
  type PickSource,
  STYLE_PROPS,
  type StyleProp,
} from './source'

/** Elements that never render: the arrow keys skip them the way they skip text nodes. */
const NON_RENDERED_TAGS = new Set([
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

/** Guard against pathological nesting; real pages are a few levels deep at most. */
const MAX_SHADOW_DEPTH = 32

const DEFAULT_ROOT_FONT_SIZE = 16

interface LiveNode extends PickNode {
  readonly element: Element
}

export interface LiveSource extends PickSource {
  readonly kind: 'live'
  /** Handle for a DOM element; the same element always yields the same handle. */
  nodeFor(element: Element): PickNode
  elementOf(node: PickNode): Element
}

export interface LiveSourceOptions {
  /** Our overlay host: never a pick target, skipped by hit tests and sibling navigation. */
  host: Element
  document?: Document
  /** Selector strategy; `finderSelector` by default, tests pass simpler ones. */
  selector?: SelectorGenerator
}

type SiblingDirection = 'nextElementSibling' | 'previousElementSibling'

function px(style: CSSStyleDeclaration, property: string): number {
  const value = Number.parseFloat(style.getPropertyValue(property))
  return Number.isFinite(value) ? value : 0
}

function edgesOf(style: CSSStyleDeclaration, prefix: string, suffix = ''): Edges {
  return {
    top: px(style, `${prefix}-top${suffix}`),
    right: px(style, `${prefix}-right${suffix}`),
    bottom: px(style, `${prefix}-bottom${suffix}`),
    left: px(style, `${prefix}-left${suffix}`),
  }
}

function shadowHostOf(element: Element): Element | null {
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

/**
 * `PickSource` over the live DOM. Hit testing goes through `elementsFromPoint`, which honours
 * stacking and `pointer-events` — so our highlight and tooltip (`pointer-events: none`) are never
 * hit, and our host is dropped from the stack explicitly. Open shadow roots are entered with
 * `shadowRoot.elementFromPoint` (slotted light-DOM children come back retargeted to themselves);
 * a closed host has no `shadowRoot` and an iframe has no accessible children, so both are leaves.
 */
export function createLiveSource({
  host,
  document: doc = document,
  selector = finderSelector,
}: LiveSourceOptions): LiveSource {
  const win = doc.defaultView ?? window
  const handles = new WeakMap<Element, LiveNode>()
  let sequence = 0

  const nodeFor = (element: Element): LiveNode => {
    const existing = handles.get(element)
    if (existing) return existing
    sequence += 1
    const node: LiveNode = { key: `n${sequence}`, element }
    handles.set(element, node)
    return node
  }

  const elementOf = (node: PickNode): Element => {
    const element = (node as Partial<LiveNode>).element
    if (!element) throw new Error(`${node.key} is not a node of the live source`)
    return element
  }

  const isPickable = (element: Element): boolean =>
    element !== host && !NON_RENDERED_TAGS.has(element.localName)

  const firstPickable = (start: Element | null, direction: SiblingDirection): PickNode | null => {
    let current = start
    while (current && !isPickable(current)) current = current[direction]
    return current ? nodeFor(current) : null
  }

  const topElementAt = (x: number, y: number): Element | null => {
    for (const element of doc.elementsFromPoint(x, y)) {
      if (element !== host) return element
    }
    return null
  }

  const rectOf = (node: PickNode): Rect => {
    const rect = elementOf(node).getBoundingClientRect()
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
  }

  const parentOf = (node: PickNode): PickNode | null => {
    const element = elementOf(node)
    if (element === doc.body) return null
    let candidate = element.parentElement ?? shadowHostOf(element)
    while (candidate && !isPickable(candidate)) {
      candidate = candidate.parentElement ?? shadowHostOf(candidate)
    }
    return candidate ? nodeFor(candidate) : null
  }

  const entryFor = (node: PickNode): PathEntry => {
    const element = elementOf(node)
    const id = element.id && isUsableId(element.id) ? element.id : null
    const classes = Array.from(element.classList).filter(isUsableClass).slice(0, 2)
    return { node, tag: element.localName, id, classes }
  }

  return {
    kind: 'live',
    nodeFor,
    elementOf,

    hitTest(x, y) {
      const top = topElementAt(x, y)
      if (!top) return null
      let element: Element = top
      for (let depth = 0; depth < MAX_SHADOW_DEPTH; depth += 1) {
        const shadow: ShadowRoot | null = element.shadowRoot
        if (!shadow) break
        const inner: Element | null = shadow.elementFromPoint(x, y)
        if (!inner || inner === element) break
        element = inner
      }
      return nodeFor(element)
    },

    rectOf,

    boxModelOf(node): BoxModel {
      const style = win.getComputedStyle(elementOf(node))
      return {
        border: rectOf(node),
        margin: edgesOf(style, 'margin'),
        borderWidth: edgesOf(style, 'border', '-width'),
        padding: edgesOf(style, 'padding'),
      }
    },

    stylesOf(node): NodeStyles {
      const style = win.getComputedStyle(elementOf(node))
      const values = {} as Record<StyleProp, string>
      for (const property of STYLE_PROPS) values[property] = style.getPropertyValue(property)
      const rootFontSize =
        px(win.getComputedStyle(doc.documentElement), 'font-size') || DEFAULT_ROOT_FONT_SIZE
      return { rootFontSize, values }
    },

    parentOf,

    firstChildOf(node) {
      const element = elementOf(node)
      if (element.localName === 'iframe') return null
      const scope: ParentNode = element.shadowRoot ?? element
      return firstPickable(scope.firstElementChild, 'nextElementSibling')
    },

    previousSiblingOf(node) {
      return firstPickable(elementOf(node).previousElementSibling, 'previousElementSibling')
    },

    nextSiblingOf(node) {
      return firstPickable(elementOf(node).nextElementSibling, 'nextElementSibling')
    },

    selectorOf(node) {
      return selectorFor(elementOf(node), selector)
    },

    pathOf(node) {
      const entries: PathEntry[] = []
      for (let current: PickNode | null = node; current; current = parentOf(current)) {
        entries.push(entryFor(current))
      }
      return entries.reverse()
    },

    dispose() {
      // Handles live in a WeakMap: nothing to release.
    },
  }
}
