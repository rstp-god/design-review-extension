import type { Units } from './model'

const PX_VALUE = /(-?\d*\.?\d+)px\b/g

function trimNumber(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/**
 * One length in the user's units: `16px` → `16px` / `1rem` (root 16), `0px` → `0`. `rem` values
 * keep up to three decimals; the root font size is whatever the page uses, not 16 by default.
 */
export function formatLength(px: number, units: Units, rootFontSize: number): string {
  if (px === 0) return '0'
  if (units === 'rem') return `${trimNumber(px / (rootFontSize || 16), 3)}rem`
  return `${trimNumber(px, 2)}px`
}

/** Rewrites every `<number>px` inside a computed value (`10px 16px`, `0px 8px 24px rgba(…)`). */
export function convertLengths(value: string, units: Units, rootFontSize: number): string {
  return value.replace(PX_VALUE, (_match, number: string) =>
    formatLength(Number.parseFloat(number), units, rootFontSize),
  )
}

/** CSS shorthand from four sides: `8px` · `10px 16px` · `8px 16px 0` · `1px 2px 3px 4px`. */
export function shorthand(top: string, right: string, bottom: string, left: string): string {
  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && right === left) return `${top} ${right}`
  if (right === left) return `${top} ${right} ${bottom}`
  return `${top} ${right} ${bottom} ${left}`
}

/** `246 × 40`, with one decimal only when the box is not a whole number of pixels. */
export function formatBoxSize(w: number, h: number): string {
  return `${trimNumber(w, 1)} × ${trimNumber(h, 1)}`
}
