import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import {
  clearExtensionStorage,
  closePagesExcept,
  getTabId,
  launchExtensionContext,
  openKeeperPage,
  openPopup,
  startReview,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'
import { installEventCounter, withFrozenPointer } from '@tests/helpers/pageEvents'
import { screenPixel } from '@tests/helpers/pixels'
import { OVERLAY_HOST_TAG } from '@/shared/constants'

/** Spec 4.2: walk + ranking of ~3000 nodes in under 300 ms. Asserted locally, reported on CI. */
const WALK_BUDGET_MS = 300

interface SnapshotStats {
  walkMs: number
  stylesMs: number
  rankMs: number
  captureMs: number
  decodeMs: number
  totalMs: number
  nodes: number
  hittable: number
  visited: number
  accuracy?: {
    points: number
    mismatches: number
    unanswered: number
    examples: Array<{ x: number; y: number; live: string; snapshot: string }>
  }
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element not laid out')
  return box
}

/** Center of a box, for `page.mouse` — locators cannot act on a page under the snapshot layer. */
function center(box: Box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function readStats(page: Page): Promise<SnapshotStats> {
  const host = page.locator(OVERLAY_HOST_TAG)
  await expect(host).toHaveAttribute('data-dr-e2e-snapshot', /walkMs/)
  return JSON.parse((await host.getAttribute('data-dr-e2e-snapshot')) ?? '{}') as SnapshotStats
}

function annotate(stats: SnapshotStats) {
  const push = (type: string, value: unknown) =>
    test.info().annotations.push({ type, description: String(value) })
  for (const key of [
    'walkMs',
    'stylesMs',
    'rankMs',
    'captureMs',
    'decodeMs',
    'totalMs',
    'nodes',
    'hittable',
    'visited',
  ] as const) {
    push(`snapshot-${key}`, stats[key])
  }
  if (stats.accuracy) {
    push('snapshot-accuracy-points', stats.accuracy.points)
    push('snapshot-accuracy-mismatches', stats.accuracy.mismatches)
    push('snapshot-accuracy-unanswered', stats.accuracy.unanswered)
    push('snapshot-accuracy-examples', JSON.stringify(stats.accuracy.examples))
  }
}

test.describe('page snapshot', () => {
  let context: BrowserContext
  let keeper: Page
  let page: Page

  const layer = () => page.getByTestId(TestId.SnapshotLayer)
  const badge = () => page.getByTestId(TestId.SnapshotBadge)
  const countdown = () => page.getByTestId(TestId.Countdown)
  const seconds = () => page.getByTestId(TestId.CountdownSeconds)
  const toast = () => page.getByTestId(TestId.OverlayToast)
  const tooltipTag = () => page.getByTestId(TestId.PickerTooltipTag)
  const freezeButton = () => page.getByTestId(TestId.ToolbarFreeze)
  const menuItem = (id: string) => page.getByTestId(testIds.menuItem(id))

  async function open(path: string) {
    page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}${path}`)
    await startReview(context, page)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
  }

  async function freeze() {
    await page.keyboard.press('f')
    await expect(layer()).toBeVisible()
    await expect(badge()).toBeVisible()
  }

  async function thaw() {
    await page.keyboard.press('f')
    await expect(layer()).toHaveCount(0)
    await expect(badge()).toHaveCount(0)
  }

  async function activatePicker() {
    await page.keyboard.press('p')
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'true')
  }

  /**
   * Hover a point and read what the picker says is there. The pointer first parks far away: the
   * picker keeps a dead zone where the previous tooltip was (report 03), and the traps sit right
   * under each other's tooltips.
   */
  async function hoverAt(point: { x: number; y: number }) {
    // Parking over the toolbar shows no tooltip and leaves a dead zone only where the toolbar is.
    const toolbar = center(await boxOf(page.getByTestId(TestId.Toolbar)))
    await page.mouse.move(toolbar.x, toolbar.y)
    await expect(tooltipTag()).toHaveCount(0)
    await page.mouse.move(point.x, point.y)
    await expect(tooltipTag()).toBeVisible()
    return tooltipTag()
  }

  test.beforeAll(async () => {
    context = await launchExtensionContext()
    keeper = await openKeeperPage(context)
  })

  test.afterAll(async () => {
    await context.close()
  })

  test.beforeEach(async () => {
    await clearExtensionStorage(context)
  })

  test.afterEach(async () => {
    await closePagesExcept(context, keeper)
  })

  test('the menu offers Now and the delays; a delayed snapshot shows the pill and can be cancelled', async () => {
    await open('/stacking/')
    const counts = await installEventCounter(page)
    await expect(freezeButton()).toHaveAttribute('aria-pressed', 'false')
    await freezeButton().hover()
    await expect(page.getByTestId(TestId.Tooltip)).toHaveText(/^SnapshotF$/)

    await freezeButton().click()
    const menu = page.getByTestId(TestId.Menu)
    await expect(menu).toBeVisible()
    await expect(menuItem('freeze-now')).toHaveText(/^NowF$/)
    await expect(menuItem('freeze-3')).toHaveText(/^In 3 s$/)
    await expect(menuItem('freeze-5')).toHaveText(/^In 5 sShiftF$/)
    await expect(menuItem('freeze-10')).toHaveText(/^In 10 s$/)
    await expect(menu).toContainText('hover states, dropdowns and animations stay put')
    expect((await menu.boundingBox())?.width).toBe(236)
    // The pointer rests on the button after the click; away from the menu the frame is stable.
    await page.mouse.move(640, 400)
    await expect(menu).toHaveScreenshot('freeze-menu.png')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveAttribute('data-theme', 'light')
    await expect(menu).toHaveScreenshot('freeze-menu-light.png')
    await page.emulateMedia({ colorScheme: 'dark' })

    await menuItem('freeze-10').click()
    await expect(menu).toHaveCount(0)
    await expect(countdown()).toBeVisible()
    await expect(countdown()).toHaveAttribute('data-corner', 'bottom-right')
    await expect(seconds()).toHaveText('10')
    await expect(countdown()).toContainText('Snapshot in 10 s')
    await expect(countdown()).toContainText('Hover the state you need')
    // The pill takes no focus and no pointer: the page keeps working while the user sets it up.
    expect(
      await page.evaluate(
        (hostTag) =>
          document
            .querySelector(hostTag)
            ?.shadowRoot?.activeElement?.closest('[data-testid="countdown"]') ?? null,
        OVERLAY_HOST_TAG,
      ),
    ).toBeNull()
    await page.mouse.move(640, 400)
    await withFrozenPointer(page, OVERLAY_HOST_TAG, () =>
      expect(countdown()).toHaveScreenshot('countdown.png'),
    )
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveAttribute('data-theme', 'light')
    await withFrozenPointer(page, OVERLAY_HOST_TAG, () =>
      expect(countdown()).toHaveScreenshot('countdown-light.png'),
    )
    await page.emulateMedia({ colorScheme: 'dark' })
    const counter = page.locator('[data-fixture="counter"]')
    await counter.click()
    await expect(counter).toHaveText('Clicked 1')
    expect((await counts()).click).toBe(1)

    await page.getByTestId(TestId.CountdownCancel).click()
    await expect(countdown()).toHaveCount(0)
    await expect(layer()).toHaveCount(0)
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(1)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
  })

  test('Shift+F counts down from the settings, restarts on repeat, Esc cancels and F fires at once', async () => {
    await open('/stacking/')
    await page.keyboard.press('Shift+F')
    await expect(countdown()).toBeVisible()
    await expect(seconds()).toHaveText('5')
    await expect(seconds()).toHaveText('4', { timeout: 3_000 })

    await page.keyboard.press('Shift+F')
    await expect(seconds()).toHaveText('5')

    await page.keyboard.press('Escape')
    await expect(countdown()).toHaveCount(0)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    await expect(layer()).toHaveCount(0)

    await page.keyboard.press('Shift+F')
    await expect(countdown()).toBeVisible()
    await page.keyboard.press('f')
    await expect(layer()).toBeVisible()
    await expect(countdown()).toHaveCount(0)
  })

  test('switching tabs during the countdown: no snapshot, the other tab is not captured', async () => {
    await open('/stacking/')
    await page.keyboard.press('Shift+F')
    await expect(countdown()).toBeVisible()

    // A page driven by Playwright never reports `document.hidden`, so the content-side cancel
    // (unit-tested) cannot fire here; the background refuses the capture instead, because the
    // sender is no longer the active tab of its window — the same outcome from the second guard.
    const other = await context.newPage()
    await other.goto(`${FIXTURE_SITE_URL}/catalog/`)
    await other.waitForTimeout(6_000)
    await page.bringToFront()
    await expect(countdown()).toHaveCount(0)
    await expect(layer()).toHaveCount(0)
    await expect(page.locator(OVERLAY_HOST_TAG)).not.toHaveAttribute('data-dr-e2e-snapshot')
    await expect(toast()).toHaveText(/Could not take the snapshot|The tab was not visible/)
    await other.close()
  })

  test('a CSS hover menu stays open on the snapshot after the pointer leaves it', async () => {
    await open('/stacking/')
    const dropdown = page.locator('[data-fixture="menu-dropdown"]')
    await page.locator('[data-fixture="menu-trigger"]').hover()
    await expect(dropdown).toBeVisible()
    const dropdownBox = await boxOf(dropdown)
    const probe = { x: dropdownBox.x + 4, y: dropdownBox.y + 4 }

    await freeze()
    await page.mouse.move(640, 500)
    await expect(dropdown).toBeHidden()
    // The dropdown is white; the header under it is #1e3a5f. The picture kept the dropdown.
    expect(await screenPixel(page, probe.x, probe.y)).toEqual([255, 255, 255])
    // The picture is not the page's to read: the canvas sits in a closed shadow root.
    expect(
      await page.evaluate(
        (hostTag) =>
          document
            .querySelector(hostTag)
            ?.shadowRoot?.querySelector('[data-testid="snapshot-layer"]')?.shadowRoot ?? null,
        OVERLAY_HOST_TAG,
      ),
    ).toBeNull()
    expect(
      await page.evaluate(
        (hostTag) => document.querySelector(hostTag)?.shadowRoot?.querySelectorAll('canvas').length,
        OVERLAY_HOST_TAG,
      ),
    ).toBe(0)
    await expect(badge()).toHaveText(/^Snapshot \d{2}:\d{2}:\d{2}\s*·\s*F\s*live page$/)
    await expect(badge()).toHaveScreenshot('snapshot-badge.png', {
      mask: [page.getByTestId(TestId.SnapshotBadgeTime)],
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveAttribute('data-theme', 'light')
    await expect(badge()).toHaveScreenshot('snapshot-badge-light.png', {
      mask: [page.getByTestId(TestId.SnapshotBadgeTime)],
    })
  })

  test('the picker on the snapshot lands on the menu item and resolves the stacking traps', async () => {
    await open('/stacking/')
    const item = page.locator('[data-fixture="menu-item-catalog"]')
    const trapLater = await boxOf(page.locator('[data-fixture="trap-later"]'))
    const trapHigh = await boxOf(page.locator('[data-fixture="trap-high"]'))
    const trapSibling = await boxOf(page.locator('[data-fixture="trap-sibling"]'))
    const trapRoot = await boxOf(page.locator('[data-fixture="trap-root"]'))
    const trapContent = await boxOf(page.locator('[data-fixture="trap-content"]'))
    const scroller = await boxOf(page.locator('[data-fixture="trap-scroller"]'))
    const ghost = await boxOf(page.locator('[data-fixture="trap-ghost"]'))
    const ghostChild = await boxOf(page.locator('[data-fixture="trap-ghost-child"]'))
    const under = await boxOf(page.locator('[data-fixture="trap-under"]'))

    await activatePicker()
    await page.locator('[data-fixture="menu-trigger"]').hover()
    await expect(item).toBeVisible()
    const itemBox = await boxOf(item)
    await freeze()
    const stats = await readStats(page)
    annotate(stats)

    // The open menu is in the picture: the item is picked, not the content under it.
    await hoverAt(center(itemBox))
    await expect(tooltipTag()).toHaveText('a')
    await page.mouse.click(center(itemBox).x, center(itemBox).y)
    await expect(page.getByTestId(TestId.PickerLockedChip)).toContainText('× ')
    await expect(page.getByTestId(TestId.PickerBreadcrumbs)).toContainText('div.menu__dropdown')
    await expect(
      page.getByTestId(TestId.PickerBreadcrumbs).locator('[aria-current="true"]'),
    ).toHaveText('a')
    await expect(page).toHaveURL(`${FIXTURE_SITE_URL}/stacking/`)
    await page.keyboard.press('Escape')

    // Earlier in the DOM, higher z-index: wins over the later static block overlapping it.
    const overlapHigh = { x: trapLater.x + 10, y: trapLater.y + 10 }
    expect(overlapHigh.y).toBeLessThan(trapHigh.y + trapHigh.height)
    await expect(await hoverAt(overlapHigh)).toHaveText('div.trap.trap-high')
    await withFrozenPointer(page, OVERLAY_HOST_TAG, () =>
      expect(page).toHaveScreenshot('snapshot-picker-hover.png', {
        clip: { x: trapHigh.x - 16, y: trapHigh.y - 16, width: 460, height: 360 },
      }),
    )
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveAttribute('data-theme', 'light')
    // A screenshot re-dispatches a mouse move from the real cursor once the freeze is lifted:
    // hover the spot again before the next capture (report 02, p. 14).
    await expect(await hoverAt(overlapHigh)).toHaveText('div.trap.trap-high')
    await withFrozenPointer(page, OVERLAY_HOST_TAG, () =>
      expect(page).toHaveScreenshot('snapshot-picker-hover-light.png', {
        clip: { x: trapHigh.x - 16, y: trapHigh.y - 16, width: 460, height: 360 },
      }),
    )
    await page.emulateMedia({ colorScheme: 'dark' })

    // A z-index of 9999 inside a transform cannot beat the sibling's z-index 1.
    await expect(await hoverAt({ x: trapSibling.x + 10, y: trapSibling.y + 10 })).toHaveText(
      'div.trap.trap-sibling',
    )
    // Negative z-index: above the root's background, below the root's content.
    await expect(
      await hoverAt({ x: trapRoot.x + 20, y: trapRoot.y + trapRoot.height - 15 }),
    ).toHaveText('div.trap-negative')
    await expect(await hoverAt(center(trapContent))).toHaveText('p.trap-content')
    // Overflow: the clipped paragraph is not there, the visible one is.
    await expect(await hoverAt({ x: scroller.x + 10, y: scroller.y + 10 })).toHaveText(
      'p.trap-inside',
    )
    await expect(
      await hoverAt({ x: scroller.x + 10, y: scroller.y + scroller.height + 10 }),
    ).not.toHaveText(/trap-outside/)
    // visibility: hidden parent is not a target; its visible child is.
    await expect(await hoverAt(center(ghostChild))).toHaveText('span.trap-ghost-child')
    await expect(await hoverAt({ x: ghost.x + ghost.width - 10, y: ghost.y + 10 })).not.toHaveText(
      /trap-ghost/,
    )
    // pointer-events: none veil lets the button under it be picked.
    await expect(await hoverAt(center(under))).toHaveText('button.trap-under')

    expect(stats.accuracy?.points).toBe(32 * 18)
  })

  test('nothing reaches the page: clicks, the wheel and the scrolling keys', async () => {
    await open('/stacking/')
    const counts = await installEventCounter(page)
    const counter = page.locator('[data-fixture="counter"]')
    const counterCenter = center(await boxOf(counter))
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await freeze()
    await page.mouse.click(counterCenter.x, counterCenter.y)
    await page.mouse.click(counterCenter.x, counterCenter.y, { button: 'right' })
    await expect(counter).toHaveText('Clicked 0')
    expect(await counts()).toEqual({ click: 0, contextmenu: 0, mousedown: 0 })

    await page.mouse.move(640, 400)
    await page.mouse.wheel(0, 300)
    await page.keyboard.press('Space')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await thaw()
    await counter.click()
    await expect(counter).toHaveText('Clicked 1')
    await page.mouse.move(640, 400)
    await page.mouse.wheel(0, 300)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })

  test('the area tool draws on the snapshot with a crosshair', async () => {
    await open('/stacking/')
    const counts = await installEventCounter(page)
    await freeze()
    await page.keyboard.press('a')
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'true')
    const shield = page.getByTestId(testIds.pickerShield(0))
    await expect(shield).toBeVisible()
    expect(await shield.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair')
    expect(await shield.boundingBox()).toEqual({ x: 0, y: 0, width: 1280, height: 720 })

    await page.mouse.move(200, 300)
    await page.mouse.down()
    await page.mouse.move(520, 460, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByTestId(TestId.AreaChip)).toHaveText('320 × 160 · x 200 y 300')
    await expect(page.getByTestId(testIds.areaHandle('se'))).toBeVisible()
    expect(await counts()).toEqual({ click: 0, contextmenu: 0, mousedown: 0 })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.AreaSelection)).toHaveCount(0)
    await expect(layer()).toBeVisible()
  })

  test('F goes back and forth keeping the tool; a locked node is dropped; Esc steps live, then exits', async () => {
    await open('/stacking/')
    const cta = page.locator('[data-fixture="trap-under"]')
    const ctaCenter = center(await boxOf(cta))
    await activatePicker()
    await page.mouse.click(ctaCenter.x, ctaCenter.y)
    await expect(page.getByTestId(TestId.PickerLockedChip)).toBeVisible()

    await freeze()
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId(TestId.PickerLockedChip)).toHaveCount(0)
    await expect(freezeButton()).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('live page')
    await hoverAt(ctaCenter)
    await page.mouse.click(ctaCenter.x, ctaCenter.y)
    await expect(page.getByTestId(TestId.PickerLockedChip)).toBeVisible()

    await thaw()
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId(TestId.PickerLockedChip)).toHaveCount(0)
    await expect(freezeButton()).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('freeze')
    await cta.hover()
    await expect(tooltipTag()).toHaveText('button.trap-under')

    await freeze()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'false')
    await expect(layer()).toBeVisible()
    await expect(page.getByTestId(TestId.OverlayHint)).toHaveText(/live page.*live page/)
    await page.keyboard.press('Escape')
    await expect(layer()).toHaveCount(0)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(0)
  })

  test('the snapshot menu offers the live page and a retake', async () => {
    await open('/stacking/')
    await freeze()
    await freezeButton().click()
    await expect(menuItem('freeze-live')).toHaveText(/^Live pageF$/)
    await expect(menuItem('freeze-5')).toHaveText(/^New snapshot in 5 sShiftF$/)
    await expect(page.getByTestId(TestId.Menu)).not.toContainText('stay put')
    await menuItem('freeze-3').click()
    await expect(layer()).toHaveCount(0)
    await expect(countdown()).toBeVisible()
    await expect(seconds()).toHaveText('3')
    await expect(layer()).toBeVisible({ timeout: 6_000 })
    await freezeButton().click()
    await menuItem('freeze-live').click()
    await expect(layer()).toHaveCount(0)
  })

  test('a window resize closes the snapshot with a toast', async () => {
    await open('/stacking/')
    await freeze()
    await page.setViewportSize({ width: 1100, height: 720 })
    await expect(layer()).toHaveCount(0)
    await expect(badge()).toHaveCount(0)
    await expect(toast()).toHaveText('Window size changed — snapshot closed')
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    await expect(toast()).toHaveCount(0, { timeout: 6_000 })
  })

  test('a field enabled after the snapshot shows — until the next snapshot', async () => {
    await open('/stacking/')
    const under = center(await boxOf(page.locator('[data-fixture="trap-under"]')))
    await activatePicker()
    await freeze()
    await hoverAt(under)
    await expect(page.getByTestId(testIds.pickerRow('radius'))).toHaveCount(0)

    const popup = await openPopup(context, await getTabId(context, page))
    await popup.getByTestId(TestId.PopupSettingsButton).click()
    await popup.getByTestId(testIds.tooltipField('radius')).click()
    await page.bringToFront()
    await page.mouse.move(0, 0)
    await hoverAt(under)
    await expect(page.getByTestId(testIds.pickerRow('radius'))).toHaveText(/Radius\s*—/)
    await expect(page.getByTestId(TestId.PickerTooltipRetake)).toHaveText(
      'Take the snapshot again for the new fields',
    )
    await expect(page.getByTestId(testIds.pickerRow('color'))).toContainText('#FFFFFF')

    await thaw()
    await freeze()
    await hoverAt(under)
    await expect(page.getByTestId(testIds.pickerRow('radius'))).toContainText('6px')
    await expect(page.getByTestId(TestId.PickerTooltipRetake)).toHaveCount(0)
  })

  test('walks ~3000 nodes within the budget and reports the timings', async () => {
    await open('/heavy/')
    expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBeGreaterThanOrEqual(
      3000,
    )
    await freeze()
    const stats = await readStats(page)
    annotate(stats)
    expect(stats.visited).toBeGreaterThanOrEqual(3000)
    expect(stats.hittable).toBeGreaterThan(100)
    expect(stats.accuracy?.points).toBe(32 * 18)
    if (!process.env.CI) expect(stats.walkMs + stats.rankMs).toBeLessThanOrEqual(WALK_BUDGET_MS)

    await activatePicker()
    await page.mouse.move(640, 400)
    await expect(tooltipTag()).toBeVisible()
  })
})
