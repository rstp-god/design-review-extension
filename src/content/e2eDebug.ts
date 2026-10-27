/**
 * Observation surface for Playwright, present ONLY in the E2E build (`VITE_E2E=1`).
 *
 * A content script lives in an isolated world: `page.evaluate` cannot read its variables, and the
 * service worker does not know what the overlay is doing. Attributes on our own host element are
 * visible to Playwright locators without touching the page. In production the constant below is
 * `false`, the factory returns `null` and the attribute names never reach `dist/content.js`
 * (checked by a contract test).
 */
const E2E = import.meta.env.VITE_E2E === '1'

export type E2EDebugKey = 'page-path' | 'nav' | 'pointermove'

export interface E2EDebug {
  set: (key: E2EDebugKey, value: string) => void
  /**
   * Whether the test asked to freeze pointer-dependent state (`data-dr-e2e-freeze` on the host):
   * a screenshot makes Chromium re-dispatch a mouse move from the real cursor position, which
   * would clear the hover being photographed.
   */
  frozen: () => boolean
}

export function createE2EDebug(host: HTMLElement): E2EDebug | null {
  if (!E2E) return null
  return {
    set: (key, value) => {
      host.setAttribute(`data-dr-e2e-${key}`, value)
    },
    frozen: () => host.hasAttribute('data-dr-e2e-freeze'),
  }
}
