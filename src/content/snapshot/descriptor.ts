import { isUsableClass, isUsableId } from '@/content/picker/classNames'

/**
 * What a snapshot remembers about an element's identity: enough for a breadcrumb and for a
 * readable selector without the live DOM. Cheap to collect — no uniqueness checks — so the walk
 * can afford one per node; the finder selector stays a lazy, on-lock luxury (picker/snapshot.ts).
 */
export interface NodeDescriptor {
  tag: string
  /** Usable id (classNames.ts), else `null`. */
  id: string | null
  /** Usable classes, in DOM order. */
  classes: string[]
  /** 1-based position among the element siblings of the same tag, like `:nth-of-type`. */
  nthOfType: number
  /** Whether another sibling shares the tag: `:nth-of-type` is only written then. */
  hasSameTagSiblings: boolean
}

/** Breadcrumb label parts: the tag, the id and up to two classes (picker/label.ts). */
export const MAX_LABEL_CLASSES = 2

export function describeElement(
  element: Element,
  nthOfType: number,
  hasSameTagSiblings: boolean,
): NodeDescriptor {
  return {
    tag: element.localName,
    id: element.id && isUsableId(element.id) ? element.id : null,
    classes: Array.from(element.classList).filter(isUsableClass),
    nthOfType,
    hasSameTagSiblings,
  }
}

/** `button.card__cta`, `article.product-card:nth-of-type(2)`, `#search`. */
export function descriptorPart(descriptor: NodeDescriptor): string {
  if (descriptor.id) return `#${CSS.escape(descriptor.id)}`
  const classes = descriptor.classes
    .slice(0, MAX_LABEL_CLASSES)
    .map((name) => `.${CSS.escape(name)}`)
    .join('')
  const nth = descriptor.hasSameTagSiblings ? `:nth-of-type(${descriptor.nthOfType})` : ''
  return `${descriptor.tag}${classes}${nth}`
}

/**
 * A selector from the descriptors of a node and its ancestors (root first, node last) within one
 * tree. It starts at the deepest ancestor with an id, is never shorter than the path and is unique
 * in the tree the descriptors were collected from. `root` (body or a shadow root) is not part of
 * it; `html` and `body` describe themselves.
 */
export function selectorFromDescriptors(chain: readonly NodeDescriptor[]): string {
  if (chain.length === 0) return ''
  const last = chain[chain.length - 1] as NodeDescriptor
  if (chain.length === 1 || last.tag === 'body' || last.tag === 'html') return last.tag
  let start = 0
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if ((chain[index] as NodeDescriptor).id) {
      start = index
      break
    }
  }
  return chain
    .slice(start)
    .map((descriptor) => descriptorPart(descriptor))
    .join(' > ')
}
