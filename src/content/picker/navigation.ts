import type { PickNode, PickSource } from './source'

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
export type ArrowKey = (typeof ARROW_KEYS)[number]

export function isArrowKey(key: string): key is ArrowKey {
  return (ARROW_KEYS as readonly string[]).includes(key)
}

/**
 * Locked-state navigation (spec F3.4): `↑` parent, `↓` first child, `←` / `→` siblings. Returns
 * `null` when there is nowhere to go — the caller keeps the current node.
 */
export function navigateFrom(source: PickSource, node: PickNode, key: ArrowKey): PickNode | null {
  switch (key) {
    case 'ArrowUp':
      return source.parentOf(node)
    case 'ArrowDown':
      return source.firstChildOf(node)
    case 'ArrowLeft':
      return source.previousSiblingOf(node)
    case 'ArrowRight':
      return source.nextSiblingOf(node)
  }
}
