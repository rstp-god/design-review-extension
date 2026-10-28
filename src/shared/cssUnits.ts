import type { Units } from './model'

const PX_VALUE = /(-?\d*\.?\d+)px\b/g

/**
 * A number for the UI: at most `maxDecimals` places, no trailing zeros, no `-0`.
 * `68.57` → `68.6`, `45.0` → `45`, `-0.04` → `0`. One decimal is the default for every px value
 * (tooltip, chips, area size); `rem` asks for three.
 */
export function formatNumber(value: number, maxDecimals = 1): string {
  const rounded = Number(value.toFixed(maxDecimals))
  return rounded === 0 ? '0' : String(rounded)
}

/**
 * One length in the user's units: `16px` → `16px` / `1rem` (root 16), `0px` → `0`. `rem` values
 * keep up to three decimals (`0.813rem` at one decimal would be a different length); the root
 * font size is whatever the page uses, not 16 by default.
 */
export function formatLength(px: number, units: Units, rootFontSize: number): string {
  if (px === 0) return '0'
  if (units === 'rem') return `${formatNumber(px / (rootFontSize || 16), 3)}rem`
  return `${formatNumber(px)}px`
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
  return `${formatNumber(w)} × ${formatNumber(h)}`
}
