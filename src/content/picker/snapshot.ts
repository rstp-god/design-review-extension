import { rectContains } from '@/content/overlay/surfaces'
import { MAX_LABEL_CLASSES, selectorFromDescriptors } from '@/content/snapshot/descriptor'
import { roundedRectContainsPoint } from '@/content/snapshot/visibility'
import { descriptorChain, type SnapshotNode } from '@/content/snapshot/walk'
import type { Rect } from '@/shared/model'
import { finderSelector, type SelectorGenerator, selectorFor } from './selector'
import type { BoxModel, NodeSelector, NodeStyles, PathEntry, PickNode, PickSource } from './source'

export interface SnapshotSourceOptions {
  /** Every kept box of the walk, in document order. */
  nodes: readonly SnapshotNode[]
  /** The hit targets sorted by rank (walk.ts). */
  hittable: readonly SnapshotNode[]
  rootFontSize: number
  viewport: { w: number; h: number }
  /** Selector strategy for elements still in the document; `finderSelector` by default. */
  selector?: SelectorGenerator
}

export interface SnapshotSource extends PickSource {
  readonly kind: 'snapshot'
  nodeOf(node: PickNode): SnapshotNode
}

/**
 * The top-most hit target at a viewport point: the highest rank whose visible rect holds it —
 * and, for a box with rounded corners, whose shape holds it: the cut-off corner belongs to
 * whatever is behind, as in the browser.
 */
export function topNodeAt(
  hittable: readonly SnapshotNode[],
  x: number,
  y: number,
): SnapshotNode | null {
  for (let index = hittable.length - 1; index >= 0; index -= 1) {
    const node = hittable[index] as SnapshotNode
    if (!node.visibleRect || !rectContains(node.visibleRect, x, y)) continue
    if (node.radii && !roundedRectContainsPoint(node.rect, node.radii, x, y)) continue
    return node
  }
  return null
}

/**
 * `PickSource` over a frozen walk (spec F5.5): hit testing by paint rank over the visible rects,
 * geometry and styles as captured, navigation along the frozen tree. Nothing here reads the
 * page's layout or styles — the page has moved on since the picture was taken. The one thing
 * taken from the document is the finder selector of a node whose element is still connected:
 * a structural read that the descriptors replace once the element is gone.
 */
export function createSnapshotSource({
  nodes,
  hittable,
  rootFontSize,
  viewport,
  selector = finderSelector,
}: SnapshotSourceOptions): SnapshotSource {
  const byKey = new Map<string, SnapshotNode>()
  for (const node of nodes) byKey.set(node.key, node)
  const selectors = new Map<SnapshotNode, NodeSelector>()

  const nodeOf = (node: PickNode): SnapshotNode => {
    const found = byKey.get(node.key)
    if (!found) throw new Error(`${node.key} is not a node of the snapshot`)
    return found
  }

  const isBody = (node: SnapshotNode) => node.descriptor.tag === 'body' && node.shadowHost === null

  const siblings = (node: SnapshotNode): readonly SnapshotNode[] => node.parent?.children ?? [node]

  const entryFor = (node: SnapshotNode): PathEntry => ({
    node,
    tag: node.descriptor.tag,
    id: node.descriptor.id,
    classes: node.descriptor.classes.slice(0, MAX_LABEL_CLASSES),
  })

  /** `host >>> inner`: one descriptor selector per tree, like `selectorFor` does for elements. */
  const descriptorSelector = (node: SnapshotNode): string => {
    const parts: string[] = []
    for (let current: SnapshotNode | null = node; current; current = current.shadowHost) {
      parts.unshift(selectorFromDescriptors(descriptorChain(current)))
    }
    return parts.join(' >>> ')
  }

  const parentOf = (node: PickNode): PickNode | null => {
    const current = nodeOf(node)
    if (isBody(current)) return null
    return current.parent
  }

  return {
    kind: 'snapshot',
    nodeOf,

    hitTest(x, y) {
      return topNodeAt(hittable, x, y)
    },

    rectOf(node) {
      return nodeOf(node).rect
    },

    boxModelOf(node): BoxModel {
      const current = nodeOf(node)
      return { border: current.rect, ...current.box }
    },

    stylesOf(node): NodeStyles {
      return { rootFontSize, values: nodeOf(node).styles }
    },

    parentOf,

    firstChildOf(node) {
      return nodeOf(node).children[0] ?? null
    },

    previousSiblingOf(node) {
      const current = nodeOf(node)
      const list = siblings(current)
      return list[list.indexOf(current) - 1] ?? null
    },

    nextSiblingOf(node) {
      const current = nodeOf(node)
      const list = siblings(current)
      return list[list.indexOf(current) + 1] ?? null
    },

    selectorOf(node): NodeSelector {
      const current = nodeOf(node)
      const cached = selectors.get(current)
      if (cached) return cached
      const element = current.element.deref()
      const result: NodeSelector = element?.isConnected
        ? { selector: selectorFor(element, selector), source: 'live' }
        : { selector: descriptorSelector(current), source: 'snapshot' }
      selectors.set(current, result)
      return result
    },

    pathOf(node) {
      const entries: PathEntry[] = []
      for (let current: PickNode | null = node; current; current = parentOf(current)) {
        entries.push(entryFor(nodeOf(current)))
      }
      return entries.reverse()
    },

    shieldRects(): Rect[] {
      return [{ x: 0, y: 0, w: viewport.w, h: viewport.h }]
    },

    dispose() {
      // Nodes stay readable: a tool may still be unmounting. Only the selector cache goes.
      selectors.clear()
    },
  }
}
