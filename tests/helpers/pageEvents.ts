import type { Page } from '@playwright/test'

/**
 * Counts page-level pointer events that got past the overlay. Installed from the page's world,
 * the way a site's own analytics would be.
 */
export async function installEventCounter(page: Page) {
  await page.evaluate(() => {
    const counts: Record<string, number> = { click: 0, contextmenu: 0, mousedown: 0 }
    for (const type of Object.keys(counts)) {
      document.addEventListener(type, () => {
        counts[type] = (counts[type] ?? 0) + 1
      })
    }
    ;(window as unknown as { __fixtureCounts: typeof counts }).__fixtureCounts = counts
  })
  return () =>
    page.evaluate(
      () => (window as unknown as { __fixtureCounts: Record<string, number> }).__fixtureCounts,
    )
}

/**
 * Freezes the overlay's pointer-dependent state for a screenshot (E2E build only). Any
 * screenshot makes Chromium re-dispatch a mouse move from the real cursor position (headed on
 * macOS: wherever the cursor is; under xvfb: outside the page), which would move or clear what is
 * being photographed, and `toHaveScreenshot` captures at least twice. The attribute is set from
 * the page's own world, as any site could.
 */
export async function withFrozenPointer(page: Page, hostTag: string, capture: () => Promise<void>) {
  const host = page.locator(hostTag)
  await host.evaluate((element) => element.setAttribute('data-dr-e2e-freeze', ''))
  try {
    await capture()
  } finally {
    await host.evaluate((element) => element.removeAttribute('data-dr-e2e-freeze'))
  }
}
