import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { TestId } from '@tests/constants/testIds'
import {
  clearExtensionStorage,
  closePagesExcept,
  launchExtensionContext,
  openKeeperPage,
  startReview,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'
import { OVERLAY_HOST_TAG } from '@/shared/constants'

/**
 * Faster than the polling fallback (500 ms) by a wide margin: a change reported within this
 * window came from the Navigation API.
 */
const EVENT_TIMEOUT_MS = 300

/** What the page can observe about its own `history` and `window`. */
function pageHistory(page: Page) {
  return page.evaluate(() => ({
    pushState: history.pushState.toString(),
    replaceState: history.replaceState.toString(),
    extensionGlobals: Object.getOwnPropertyNames(window).filter((name) => name.startsWith('__dr')),
  }))
}

test.describe('SPA navigation tracking', () => {
  let context: BrowserContext
  let keeper: Page
  let page: Page

  test.beforeAll(async () => {
    context = await launchExtensionContext()
    keeper = await openKeeperPage(context)
  })

  test.afterAll(async () => {
    await context.close()
  })

  test.beforeEach(async () => {
    await clearExtensionStorage(context)
    page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/spa/`)
  })

  test.afterEach(async () => {
    await closePagesExcept(context, keeper)
  })

  test('pushState, replaceState and Back are tracked through the Navigation API from the isolated world', async () => {
    const before = await pageHistory(page)
    await startReview(context, page)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()

    const host = page.locator(OVERLAY_HOST_TAG)
    await expect(host).toHaveAttribute('data-dr-e2e-nav', 'navigation-api')
    await expect(host).toHaveAttribute('data-dr-e2e-page-path', '/spa')

    await page.locator('[data-fixture="spa-link-products"]').click()
    await expect(host).toHaveAttribute('data-dr-e2e-page-path', '/spa/products', {
      timeout: EVENT_TIMEOUT_MS,
    })

    await page.locator('[data-fixture="spa-replace"]').click()
    await expect(host).toHaveAttribute('data-dr-e2e-page-path', '/spa/replaced', {
      timeout: EVENT_TIMEOUT_MS,
    })

    await page.goBack()
    await expect(host).toHaveAttribute('data-dr-e2e-page-path', '/spa', {
      timeout: EVENT_TIMEOUT_MS,
    })
    await expect(page.locator('[data-fixture="spa-view"]')).toHaveText('View: /spa/')

    await page.goForward()
    await expect(host).toHaveAttribute('data-dr-e2e-page-path', '/spa/replaced', {
      timeout: EVENT_TIMEOUT_MS,
    })

    // The page's history API is untouched while the review is open and after it ends.
    const during = await pageHistory(page)
    expect(during.pushState).toMatch(/\[native code\]/)
    expect(during.replaceState).toMatch(/\[native code\]/)
    expect(during.extensionGlobals).toEqual([])
    expect(during).toEqual(before)

    await page.keyboard.press('Escape')
    await expect(host).toHaveCount(0)
    expect(await pageHistory(page)).toEqual(before)
  })
})
