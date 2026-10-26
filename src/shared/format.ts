import type { ReviewSession } from './schemas'

const KIB = 1024

/** `12.4 MB` / `12,4 МБ` — unit labels come from `Intl`, so no translation keys are needed. */
export function formatBytes(bytes: number, locale: string): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  const [value, unit] =
    safe >= KIB * KIB * KIB
      ? [safe / (KIB * KIB * KIB), 'gigabyte']
      : safe >= KIB * KIB
        ? [safe / (KIB * KIB), 'megabyte']
        : safe >= KIB
          ? [safe / KIB, 'kilobyte']
          : [safe, 'byte']

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    // "512 bytes" rather than the short form's "512 byte".
    unitDisplay: unit === 'byte' ? 'long' : 'short',
    maximumFractionDigits: unit === 'byte' ? 0 : 1,
  }).format(value)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * `today` / `yesterday` / `24 Oct` / `24 Oct 2025` in the given locale. Day boundaries are local
 * time, which is what a person reading "yesterday" expects.
 */
export function formatRelativeDay(iso: string, now: Date, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (dayDiff === 0 || dayDiff === -1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dayDiff, 'day')
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

/**
 * Splits a `chrome.commands` shortcut into key caps. Chrome reports `Alt+Shift+R` on Windows and
 * Linux but a glyph string like `⌥⇧R` on macOS; both become one cap per key.
 */
export function splitShortcut(shortcut: string): string[] {
  const trimmed = shortcut.trim()
  if (trimmed === '') return []
  if (trimmed.includes('+')) {
    return trimmed
      .split('+')
      .map((part) => part.trim())
      .filter((part) => part !== '')
  }
  return Array.from(trimmed)
}

/** `https://shop.example.ru` → `shop.example.ru`; `http://localhost:5173` → `localhost:5173`. */
export function displayHost(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** Host for a domain session, `host/path` for a page session. */
export function sessionLabel(session: Pick<ReviewSession, 'scope' | 'origin' | 'path'>): string {
  const host = displayHost(session.origin)
  if (session.scope === 'page' && session.path && session.path !== '/') {
    return `${host}${session.path}`
  }
  return host
}
