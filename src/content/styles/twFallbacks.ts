/**
 * Tailwind v4 registers its `--tw-*` variables with `@property … { initial-value: … }`. Chrome
 * ignores `@property` rules that live inside a shadow root, so without a registered initial value
 * `box-shadow: var(--tw-inset-shadow), …, var(--tw-shadow)` is invalid at computed-value time and
 * every shadow, ring and transform silently disappears.
 *
 * These helpers read the compiled overlay CSS (our own string, not page data) and produce one
 * rule that sets each initial value on the host and on every element of the shadow tree — the
 * same per-element shape Tailwind uses in its own `@supports` fallback. Setting them on `:host`
 * alone would make them inherit: a `ring-*` child would then pick up its parent's `--tw-shadow`.
 */
const PROPERTY_RULE = /@property\s+(--tw-[\w-]+)\s*\{([^}]*)\}/g
const INITIAL_VALUE = /initial-value\s*:\s*([^;]+)/

export const TW_FALLBACK_SELECTOR = ':host,*,::before,::after'

/** `[name, initialValue]` for every `@property --tw-*` rule that declares an initial value. */
export function extractTwPropertyInitials(css: string): Array<[string, string]> {
  const result: Array<[string, string]> = []
  for (const match of css.matchAll(PROPERTY_RULE)) {
    const name = match[1]
    const body = match[2]
    if (!name || body === undefined) continue
    const initial = INITIAL_VALUE.exec(body)
    if (initial?.[1]) result.push([name, initial[1].trim()])
  }
  return result
}

/** A CSS rule with the fallbacks, or an empty string when the CSS registers no `--tw-*` props. */
export function buildTwPropertyFallbacks(css: string): string {
  const entries = extractTwPropertyInitials(css)
  if (entries.length === 0) return ''
  const declarations = entries.map(([name, value]) => `${name}:${value}`).join(';')
  return `${TW_FALLBACK_SELECTOR}{${declarations}}`
}
