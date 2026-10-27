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
export function selectorFor(element: Element, generate: SelectorGenerator): string {
  const chain: Element[] = []
  for (let current: Element | null = element; current; ) {
    chain.unshift(current)
    const root = current.getRootNode()
    current = root instanceof ShadowRoot ? root.host : null
  }
  return chain.map((link) => generate(link, scopeOf(link))).join(' >>> ')
}
