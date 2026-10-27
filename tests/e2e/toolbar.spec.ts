import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { TestId } from '@tests/constants/testIds'
import { makeFixtureIssues, makeFixtureSession } from '@tests/fixtures/data'
import {
  clearExtensionStorage,
  closePagesExcept,
  launchExtensionContext,
  openKeeperPage,
  seedSessions,
  startReview,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'
import { OVERLAY_HOST_TAG, TOOLBAR_STATE_KEY } from '@/shared/constants'

/** Computed style of an element inside our shadow root (locators pierce open shadow roots). */
function computed(page: Page, testId: string, property: string) {
  return page
    .getByTestId(testId)
    .evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property)
}

async function pageFingerprint(page: Page) {
  return page.evaluate(() => ({
    headChildren: document.head.children.length,
    bodyClass: document.body.className,
    titleFont: getComputedStyle(document.querySelector('[data-fixture="title"]') as Element)
      .fontSize,
    bodyFont: getComputedStyle(document.body).fontFamily,
    rootFont: getComputedStyle(document.documentElement).fontSize,
  }))
}

test.describe('toolbar', () => {
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
    await page.goto(`${FIXTURE_SITE_URL}/`)
  })

  test.afterEach(async () => {
    await closePagesExcept(context, keeper)
  })

  test('start mounts one shadow host with the toolbar; unfinished tools are soft-disabled with tooltips', async () => {
    const before = await pageFingerprint(page)
    const started = Date.now()
    await startReview(context, page)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    test
      .info()
      .annotations.push({ type: 'toolbar-appeared-ms', description: String(Date.now() - started) })

    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(1)
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('Esc')
    for (const id of [
      TestId.ToolbarArea,
      TestId.ToolbarFreeze,
      TestId.ToolbarIssues,
      TestId.ToolbarExport,
    ]) {
      await expect(page.getByTestId(id)).toHaveAttribute('aria-disabled', 'true')
    }
    await expect(page.getByTestId(TestId.ToolbarPicker)).not.toHaveAttribute('aria-disabled')
    await page.getByTestId(TestId.ToolbarArea).hover()
    await expect(page.getByTestId(TestId.Tooltip)).toContainText(/Area · Coming soon/)
    await page.getByTestId(TestId.ToolbarPicker).hover()
    await expect(page.getByTestId(TestId.Tooltip)).toHaveText(/^PickerP$/)
    await page.mouse.move(400, 400)
    await expect(page.getByTestId(TestId.Tooltip)).toHaveCount(0)

    // Our styles stay inside: the page did not change.
    expect(await pageFingerprint(page)).toEqual(before)
    await expect(page.getByTestId(TestId.Toolbar)).toHaveScreenshot('toolbar-expanded.png')
  })

  test('page styles do not reach the toolbar (html font-size 62.5%, hostile tag rules)', async () => {
    await startReview(context, page)
    const exit = page.getByTestId(TestId.ToolbarExit)
    await expect(exit).toBeVisible()

    const box = await exit.boundingBox()
    expect(box?.width).toBe(44)
    expect(box?.height).toBe(44)
    expect(await computed(page, TestId.Toolbar, 'font-size')).toBe('13px')
    expect(await computed(page, TestId.Toolbar, 'font-family')).not.toMatch(/Georgia/)
    expect(await computed(page, TestId.ToolbarExit, 'border-radius')).toBe('8px')
    expect(await computed(page, TestId.ToolbarExit, 'background-color')).not.toBe(
      'rgb(214, 40, 40)',
    )
    expect(await computed(page, TestId.ToolbarExit, 'letter-spacing')).toBe('normal')
    expect(await computed(page, TestId.OverlayHint, 'font-size')).toBe('12px')

    const icon = await exit.locator('svg').boundingBox()
    expect(icon?.width).toBe(20)
    expect(icon?.height).toBe(20)
  })

  test('a page with a session shows its issue count on the toolbar and the collapsed button', async () => {
    await seedSessions(context, { sessions: [makeFixtureSession()], issues: makeFixtureIssues() })
    await startReview(context, page)

    await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('3')
    await page.getByTestId(TestId.ToolbarCollapse).click()
    await expect(page.getByTestId(TestId.ToolbarCollapsedBadge)).toHaveText('3')
  })

  test('a second start does not create a second overlay', async () => {
    await startReview(context, page)
    await startReview(context, page)
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(1)
    await expect(page.getByTestId(TestId.Toolbar)).toHaveCount(1)
  })

  test('collapse and expand', async () => {
    await startReview(context, page)
    await page.getByTestId(TestId.ToolbarCollapse).click()
    await expect(page.getByTestId(TestId.Toolbar)).toHaveCount(0)
    const collapsed = page.getByTestId(TestId.ToolbarCollapsed)
    await expect(collapsed).toBeVisible()
    const box = await collapsed.boundingBox()
    expect(box?.width).toBe(48)
    await expect(collapsed).toHaveScreenshot('toolbar-collapsed.png')

    await collapsed.click()
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
  })

  test('dragging by the grip moves the toolbar and the position survives a restart', async () => {
    await startReview(context, page)
    const toolbar = page.getByTestId(TestId.Toolbar)
    const grip = page.getByTestId(TestId.ToolbarGrip)
    const before = await toolbar.boundingBox()
    const gripBox = await grip.boundingBox()
    if (!before || !gripBox) throw new Error('toolbar not laid out')

    const startX = gripBox.x + gripBox.width / 2
    const startY = gripBox.y + gripBox.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 150, startY + 100, { steps: 8 })
    await page.mouse.move(startX - 300, startY + 200, { steps: 8 })
    await page.mouse.up()

    const after = await toolbar.boundingBox()
    const target = { x: before.x - 300, y: before.y + 200 }
    expect(Math.abs((after?.x ?? 0) - target.x)).toBeLessThanOrEqual(2)
    expect(Math.abs((after?.y ?? 0) - target.y)).toBeLessThanOrEqual(2)

    const readStored = async () => {
      const worker = context.serviceWorkers()[0]
      return worker?.evaluate(
        async (key) =>
          (await chrome.storage.local.get(key))[key] as
            | { x: number; y: number; collapsed: boolean }
            | undefined,
        TOOLBAR_STATE_KEY,
      )
    }
    await expect.poll(readStored).toMatchObject({ collapsed: false })
    const stored = await readStored()
    expect(Math.abs((stored?.x ?? 0) - target.x)).toBeLessThanOrEqual(2)
    expect(Math.abs((stored?.y ?? 0) - target.y)).toBeLessThanOrEqual(2)

    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(0)

    await startReview(context, page)
    const restored = await page.getByTestId(TestId.Toolbar).boundingBox()
    expect(Math.abs((restored?.x ?? 0) - target.x)).toBeLessThanOrEqual(2)
    expect(Math.abs((restored?.y ?? 0) - target.y)).toBeLessThanOrEqual(2)
  })

  test('Escape removes everything we added and leaves the page working', async () => {
    await startReview(context, page)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(0)
    await expect(page.locator('[data-testid]')).toHaveCount(0)

    await page.locator('[data-fixture="input"]').fill('still typing')
    await expect(page.locator('[data-fixture="input"]')).toHaveValue('still typing')
    await page.locator('[data-fixture="counter"]').click()
    await expect(page.locator('[data-fixture="counter"]')).toHaveText('Clicked 1')
  })

  test('the exit button also removes the overlay and typing in the page is unaffected by hotkeys', async () => {
    await startReview(context, page)
    await page.locator('[data-fixture="input"]').click()
    await page.keyboard.type('pa')
    await expect(page.locator('[data-fixture="input"]')).toHaveValue('pa')
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()

    await page.getByTestId(TestId.ToolbarExit).click()
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(0)
  })

  test('system theme follows the OS color scheme live; explicit themes do not', async () => {
    await page.emulateMedia({ colorScheme: 'light' })
    await startReview(context, page)
    const host = page.locator(OVERLAY_HOST_TAG)
    await expect(host).toHaveAttribute('data-theme', 'light')
    expect(await computed(page, TestId.Toolbar, 'background-color')).toBe('rgb(255, 255, 255)')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(host).toHaveAttribute('data-theme', 'dark')
    expect(await computed(page, TestId.Toolbar, 'background-color')).toBe('rgb(30, 31, 34)')
  })
})
