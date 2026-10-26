import type { SessionScope } from './schemas'

/**
 * Pathname normalization for page-scoped sessions: collapses repeated slashes and drops the
 * trailing slash, so `/catalog`, `/catalog/` and `/catalog//` are the same page. The root stays `/`.
 */
export function normalizePath(pathname: string): string {
  const collapsed = `/${pathname}`.replace(/\/{2,}/g, '/')
  const trimmed = collapsed.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Session key (spec 3.1):
 * - `domain`: the origin — protocol + host + port. `shop.example.ru` and `example.ru`,
 *   `localhost:3000` and `localhost:5173`, `http` and `https` are all different sessions.
 * - `page`: origin + normalized pathname. Query and hash are ignored.
 */
export function sessionKey(url: string | URL, scope: SessionScope): string {
  const parsed = typeof url === 'string' ? new URL(url) : url
  return scope === 'domain' ? parsed.origin : `${parsed.origin}${normalizePath(parsed.pathname)}`
}

const INJECTABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:'])

/**
 * Pages where Chrome does not let extensions run: internal pages, other extensions, the Web
 * Store and the built-in PDF viewer (spec F1.5). The PDF check is a URL heuristic; an injection
 * that still fails is reported by the background and shown as the same state.
 */
export function isRestrictedUrl(url: string | null | undefined): boolean {
  if (!url) return true

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return true
  }

  if (!INJECTABLE_PROTOCOLS.has(parsed.protocol)) return true
  if (parsed.hostname === 'chromewebstore.google.com') return true
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore'))
    return true
  if (/\.pdf$/i.test(parsed.pathname)) return true

  return false
}
