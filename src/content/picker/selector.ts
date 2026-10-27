import { finder } from '@medv/finder'
import { isUsableClass, isUsableId } from './classNames'

/** finder's search budget per element: a selector is computed once per locked / hovered node. */
const FINDER_TIMEOUT_MS = 300
const FINDER_MAX_PATH_CHECKS = 2_000

/** `1` for the first element of its tag among its siblings, like `:nth-of-type`. */
function nthOfType(element: Element): number {
  let index = 1
  for (
    let sibling = element.previousElementSibling;
    sibling;
    sibling = sibling.previousElementSibling
  ) {
    if (sibling.localName === element.localName) index += 1
  }
  return index
}

/**
 * Structural selector from `root` down to the element: `main > section:nth-of-type(1) >
 * button:nth-of-type(2)`. Always unique within `root`, never short — the fallback when a nicer
 * selector cannot be found. `root` itself is not part of the selector.
 */
export function cssPathSelector(element: Element, root: ParentNode): string {
  const parts: string[] = []
  for (let current: Element | null = element; current && current !== root; ) {
    parts.unshift(`${current.localName}:nth-of-type(${nthOfType(current)})`)
    current = current.parentElement
  }
  return parts.join(' > ')
}

/**
 * Short unique selector from `@medv/finder` (spec 5.6) with our own class / id filter: finder's
 * default accepts only `[a-z-]` names, which would drop BEM classes like `card__cta`, and it does
 * not know generated hashes. Attributes keep finder's defaults (`role`, `name`, `aria-label`,
 * word-like `data-*`). `root` may be a shadow root: finder scopes its uniqueness checks to it.
 */
export function finderSelector(element: Element, root: ParentNode): string {
  try {
    return finder(element, {
      // finder types the root as Element; a ShadowRoot has the `querySelectorAll` it needs.
      root: root as Element,
      className: isUsableClass,
      idName: isUsableId,
      timeoutMs: FINDER_TIMEOUT_MS,
      maxNumberOfPathChecks: FINDER_MAX_PATH_CHECKS,
    })
  } catch {
    return cssPathSelector(element, root)
  }
}

export type SelectorGenerator = (element: Element, root: ParentNode) => string

/** The scope a selector for the element is unique in: its shadow root, else the document body. */
function scopeOf(element: Element): ParentNode {
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root : (element.ownerDocument.body ?? element.ownerDocument)
}

/**
 * Selector for an element anywhere in the page. Elements inside open shadow roots get one
 * selector per tree joined by ` >>> ` (DevTools' notation: it is for people and for a future
 * resolver, not for `querySelector`).
 */
export function selectorFor(
  element: Element,
  generate: SelectorGenerator = finderSelector,
): string {
  const chain: Element[] = []
  for (let current: Element | null = element; current; ) {
    chain.unshift(current)
    const root = current.getRootNode()
    current = root instanceof ShadowRoot ? root.host : null
  }
  return chain.map((link) => generate(link, scopeOf(link))).join(' >>> ')
}
