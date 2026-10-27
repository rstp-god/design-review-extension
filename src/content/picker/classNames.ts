/**
 * Which class names and ids may appear in a selector or a breadcrumb. Build tools generate names
 * that change on every build; a report with `.Button_root__3xK9d` is useless a week later.
 *
 * Heuristics, documented by the unit tests:
 * - characters: only `[A-Za-z0-9_-]`, not starting with a digit — Tailwind arbitrary values
 *   (`w-[32px]`, `md:flex`, `bg-[#fff]`) and React ids (`:r1:`) fall out here;
 * - known generated prefixes: styled-components `sc-`, emotion `css-`, Svelte `svelte-`, JSS `jss1`;
 * - CSS modules / emotion hashes: a `_`/`-` separated segment of 5+ characters with at least two
 *   digits and a letter (`3xK9d`, `1a2b3c4`, `e1x2y3z0`);
 * - styled-components class hashes without a prefix: a 5+ character segment with no vowel at all
 *   (`kQXhDd`) or a lowercase-first segment with three or more capitals (`bvcNqR`).
 * Legitimate names stay: `card__cta`, `product-card__price`, `col-md-6`, `grid-cols-12`,
 * `productCard`, `MuiButton-root`.
 */
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/
const GENERATED_PREFIX = /^(sc-|css-|emotion-|svelte-|jss\d)/i
const VOWEL = /[aeiouy]/i

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) ?? []).length
}

function isHashSegment(segment: string): boolean {
  if (segment.length < 5) return false
  const digits = countMatches(segment, /\d/g)
  const letters = countMatches(segment, /[a-z]/gi)
  if (digits >= 2 && letters >= 1) return true
  if (digits > 0) return false
  if (!VOWEL.test(segment)) return true
  const upper = countMatches(segment, /[A-Z]/g)
  const lower = countMatches(segment, /[a-z]/g)
  return upper >= 3 && lower >= 1 && /^[a-z]/.test(segment)
}

export function isHashedClass(name: string): boolean {
  if (GENERATED_PREFIX.test(name)) return true
  return name.split(/[_-]+/).some(isHashSegment)
}

export function isUsableClass(name: string): boolean {
  return SAFE_NAME.test(name) && !isHashedClass(name)
}

export function isUsableId(id: string): boolean {
  return SAFE_NAME.test(id) && !isHashedClass(id)
}
