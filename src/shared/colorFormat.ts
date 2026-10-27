import type { ColorFormat } from './model'

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0..1 */
  a: number
}

const RGB_FUNCTION = /^rgba?\(\s*([^)]+)\)$/i
const HEX = /^#([0-9a-f]{3,8})$/i

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1
  const trimmed = raw.trim()
  const value = trimmed.endsWith('%')
    ? Number.parseFloat(trimmed) / 100
    : Number.parseFloat(trimmed)
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

function parseHex(digits: string): Rgba | null {
  const short = digits.length === 3 || digits.length === 4
  const long = digits.length === 6 || digits.length === 8
  if (!short && !long) return null
  const expanded = short ? Array.from(digits, (d) => d + d).join('') : digits
  const channel = (offset: number) => Number.parseInt(expanded.slice(offset, offset + 2), 16)
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: expanded.length === 8 ? channel(6) / 255 : 1,
  }
}

/**
 * Parses what `getComputedStyle` returns for colors (`rgb(r, g, b)`, `rgba(r, g, b, a)`, the
 * modern `rgb(r g b / a)`, `transparent`) plus hex. Anything else — `color(display-p3 …)`,
 * `lab()` — is `null` and shown as is.
 */
export function parseCssColor(value: string): Rgba | null {
  const trimmed = value.trim()
  if (trimmed.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  const hex = HEX.exec(trimmed)
  if (hex?.[1]) return parseHex(hex[1])

  const fn = RGB_FUNCTION.exec(trimmed)
  if (!fn?.[1]) return null
  const [channels, alphaPart] = fn[1].split('/')
  const parts = (channels ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return null
  const [r, g, b] = parts.map((part) => Number.parseFloat(part))
  if (r === undefined || g === undefined || b === undefined) return null
  if (![r, g, b].every(Number.isFinite)) return null
  return {
    r: clampChannel(r),
    g: clampChannel(g),
    b: clampChannel(b),
    a: parseAlpha(alphaPart ?? parts[3]),
  }
}

export function isTransparent(value: string): boolean {
  return parseCssColor(value)?.a === 0
}

function hex2(channel: number): string {
  return channel.toString(16).padStart(2, '0').toUpperCase()
}

function formatAlpha(a: number): string {
  return String(Math.round(a * 100) / 100)
}

function toHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l: Math.round(l * 100) }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** `#2563EB`, `#2563EB80` · `rgb(37, 99, 235)`, `rgba(37, 99, 235, 0.5)` · `hsl(221, 83%, 53%)`. */
export function formatColor(color: Rgba, format: ColorFormat): string {
  const opaque = color.a >= 1
  switch (format) {
    case 'hex':
      return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}${
        opaque ? '' : hex2(Math.round(color.a * 255))
      }`
    case 'rgb':
      return opaque
        ? `rgb(${color.r}, ${color.g}, ${color.b})`
        : `rgba(${color.r}, ${color.g}, ${color.b}, ${formatAlpha(color.a)})`
    case 'hsl': {
      const { h, s, l } = toHsl(color)
      return opaque
        ? `hsl(${h}, ${s}%, ${l}%)`
        : `hsla(${h}, ${s}%, ${l}%, ${formatAlpha(color.a)})`
    }
  }
}

/** Formats a computed color in the user's format; unparseable values pass through untouched. */
export function formatCssColor(value: string, format: ColorFormat): string {
  const parsed = parseCssColor(value)
  return parsed ? formatColor(parsed, format) : value.trim()
}
