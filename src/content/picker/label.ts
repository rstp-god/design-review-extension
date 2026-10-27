import type { PathEntry } from './source'

/** `#id.class.class` after the tag; empty for a bare tag. */
export function entrySuffix(entry: PathEntry): string {
  return `${entry.id ? `#${entry.id}` : ''}${entry.classes.map((name) => `.${name}`).join('')}`
}

/** `button.card__cta`, `article#card-1.product-card`. */
export function entryLabel(entry: PathEntry): string {
  return `${entry.tag}${entrySuffix(entry)}`
}
