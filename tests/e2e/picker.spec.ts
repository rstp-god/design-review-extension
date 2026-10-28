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
import { formatCssColor } from '@/shared/colorFormat'
import { OVERLAY_HOST_TAG } from '@/shared/constants'
import { convertLengths, formatBoxSize, shorthand } from '@/shared/cssUnits'

/** Spec 4.2: the hover handler fits in one frame. Asserted locally; CI containers only report it. */
const HOVER_P95_BUDGET_MS = 16
const PERF_MOVE_STEPS = 200

const CTA = '.product-card .card__cta'

interface PerfStats {
  count: number
  p50: number
  p95: number
  max: number
}

/** `rgb(29, 78, 216)` → `#1D4ED8`, the tooltip's default color format. */
function hexOf(rgb: string): string {
  return formatCssColor(rgb, 'hex')
}

/** CSS shorthand of four computed sides in px, the way the tooltip prints padding and margin. */
function sides([top, right, bottom, left]: string[]): string {
  const [t, r, b, l] = [top, right, bottom, left].map((side) =>
    convertLengths(side ?? '', 'px', 16),
  )
  return shorthand(t ?? '0', r ?? '0', b ?? '0', l ?? '0')
}

/** What the page itself says about an element — the tooltip must agree (spec 3.3 AC). */
function computedOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const px = (value: string) => Number.parseFloat(value) || 0
    const inset = (side: 'Top' | 'Right' | 'Bottom' | 'Left') =>
      px(style[`border${side}Width`]) + px(style[`padding${side}`])
    return {
      rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
      content: {
        x: rect.left + inset('Left'),
        y: rect.top + inset('Top'),
        w: rect.width - inset('Left') - inset('Right'),
        h: rect.height - inset('Top') - inset('Bottom'),
      },
      font: `${style.fontFamily.split(',')[0]?.replace(/"/g, '').trim()} ${style.fontSize}/${style.lineHeight} · ${style.fontWeight}`,
      color: style.color,
      backgroundColor: style.backgroundColor,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      margin: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft],
      display: style.display,
    }
  })
}

function activeCrumb(page: Page) {
  return page.getByTestId(TestId.PickerBreadcrumbs).locator('[aria-current="true"]')
}

async function activatePicker(page: Page) {
  await page.keyboard.press('p')
  await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'true')
}

test.describe('picker', () => {
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
    await startReview(context, page)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
  })

  test.afterEach(async () => {
    await closePagesExcept(context, keeper)
  })

  test('P activates the picker; hover draws the box model and a tooltip that matches computed styles', async () => {
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'false')
    await activatePicker(page)
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('Click to pick')

    const cta = page.locator(CTA).first()
    const expected = await computedOf(cta)
    await cta.hover()

    const content = page.getByTestId(TestId.PickerHighlightContent)
    await expect(content).toBeVisible()
    const contentBox = await content.boundingBox()
    expect(Math.abs((contentBox?.x ?? 0) - expected.content.x)).toBeLessThanOrEqual(1)
    expect(Math.abs((contentBox?.y ?? 0) - expected.content.y)).toBeLessThanOrEqual(1)
    expect(Math.abs((contentBox?.width ?? 0) - expected.content.w)).toBeLessThanOrEqual(1)
    expect(Math.abs((contentBox?.height ?? 0) - expected.content.h)).toBeLessThanOrEqual(1)
    const paddingBox = await page.getByTestId(TestId.PickerHighlightPadding).boundingBox()
    expect(Math.abs((paddingBox?.width ?? 0) - expected.rect.w)).toBeLessThanOrEqual(1)

    const tooltip = page.getByTestId(TestId.PickerTooltip)
    await expect(tooltip).toBeVisible()
    await expect(page.getByTestId(TestId.PickerTooltipTag)).toHaveText('button.card__cta')
    await expect(page.getByTestId(TestId.PickerTooltipSize)).toHaveText(
      formatBoxSize(expected.rect.w, expected.rect.h),
    )
    await expect(page.getByTestId(testIds.pickerRow('font'))).toContainText(expected.font)
    await expect(page.getByTestId(testIds.pickerRow('color'))).toContainText(hexOf(expected.color))
    await expect(page.getByTestId(testIds.pickerRow('background'))).toContainText(
      hexOf(expected.backgroundColor),
    )
    await expect(page.getByTestId(testIds.pickerRow('padding'))).toContainText(
      sides(expected.padding),
    )
    await expect(page.getByTestId(testIds.pickerRow('margin'))).toContainText(
      sides(expected.margin),
    )
    await expect(page.getByTestId(testIds.pickerRow('display'))).toContainText(expected.display)
    await expect(page.getByTestId(testIds.pickerRow('radius'))).toHaveCount(0)
    expect((await tooltip.boundingBox())?.width).toBe(290)

    await withFrozenPointer(page, OVERLAY_HOST_TAG, () =>
      expect(page).toHaveScreenshot('picker-hover.png', {
        clip: { x: expected.rect.x - 24, y: expected.rect.y - 48, width: 360, height: 300 },
      }),
    )
    await expect(page.getByTestId(TestId.Toolbar)).toHaveScreenshot('toolbar-picker-active.png')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveAttribute('data-theme', 'light')
    await expect(page.getByTestId(TestId.Toolbar)).toHaveScreenshot(
      'toolbar-picker-active-light.png',
    )
  })

  test('nothing is highlighted while the pointer is over our own UI', async () => {
    await activatePicker(page)
    const cta = page.locator(CTA).first()
    await cta.hover()
    await expect(page.getByTestId(TestId.PickerHighlight)).toBeVisible()
    await expect(page.getByTestId(TestId.PickerTooltip)).toBeVisible()

    // The hint is pointer-events: none, so `hover()` would wait for it to receive events.
    for (const id of [TestId.Toolbar, TestId.OverlayHint]) {
      const box = await page.getByTestId(id).boundingBox()
      if (!box) throw new Error(`${id} not laid out`)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByTestId(TestId.PickerHighlight)).toHaveCount(0)
      await expect(page.getByTestId(TestId.PickerTooltip)).toHaveCount(0)
    }

    await cta.hover()
    await expect(page.getByTestId(TestId.PickerHighlight)).toBeVisible()
  })

  test('page clicks are blocked only while picking; a click locks the node, Esc steps back', async () => {
    const counts = await installEventCounter(page)
    await activatePicker(page)

    await page.locator('.header a[href="/cart/"]').first().click()
    await expect(page).toHaveURL(`${FIXTURE_SITE_URL}/`)
    await expect(page.getByTestId(TestId.PickerLockedChip)).toContainText('× ')
    await expect(activeCrumb(page)).toHaveText('a')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.PickerLockedChip)).toHaveCount(0)
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'true')

    const counter = page.locator('[data-fixture="counter"]')
    await counter.click()
    await expect(counter).toHaveText('Clicked 0')
    await expect(page.getByTestId(TestId.PickerLockedChip)).toContainText(
      '[data-fixture="counter"]',
    )
    await counter.click({ button: 'right' })
    expect(await counts()).toEqual({ click: 0, contextmenu: 0, mousedown: 0 })

    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    await counter.click()
    await expect(counter).toHaveText('Clicked 1')
    expect((await counts()).click).toBe(1)

    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(0)
  })

  test('Locked: frame, chip, breadcrumbs and arrow navigation; arrows scroll only while picking', async () => {
    await activatePicker(page)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    const cta = page.locator(CTA).first()
    const expected = await computedOf(cta)
    await cta.click()
    const frame = page.getByTestId(TestId.PickerLockedFrame)
    await expect(frame).toBeVisible()
    const frameBox = await frame.boundingBox()
    expect(Math.abs((frameBox?.x ?? 0) - (expected.rect.x - 3))).toBeLessThanOrEqual(1)
    expect(Math.abs((frameBox?.width ?? 0) - (expected.rect.w + 6))).toBeLessThanOrEqual(1)
    await expect(page.getByTestId(TestId.PickerLockedChip)).toHaveText(
      `.card__cta · ${formatBoxSize(expected.rect.w, expected.rect.h)}`,
    )
    await expect(page.getByTestId(TestId.PickerHighlight)).toHaveCount(0)
    await expect(page.getByTestId(TestId.OverlayHint)).toHaveCount(0)
    await expect(page.getByTestId(TestId.PickerBreadcrumbs)).toContainText('body')
    await expect(activeCrumb(page)).toHaveText('button.card__cta')
    await expect(page.getByTestId(TestId.PickerHintEnter)).toContainText('soon')
    await expect(page).toHaveScreenshot('picker-locked.png', {
      clip: { x: expected.rect.x - 24, y: expected.rect.y - 48, width: 360, height: 130 },
    })
    // The re-dispatched mouse move may land on the bar: park the pointer first.
    await page.mouse.move(640, 300)
    await expect(page.getByTestId(TestId.PickerLockedBar)).toHaveScreenshot('picker-locked-bar.png')

    // `↓` on a leaf: nothing happens, and the page does not scroll in Locked.
    await page.keyboard.press('ArrowDown')
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await expect(activeCrumb(page)).toHaveText('button.card__cta')

    await page.keyboard.press('ArrowUp')
    await expect(activeCrumb(page)).toHaveText('article.product-card')
    await page.keyboard.press('ArrowDown')
    await expect(activeCrumb(page)).toHaveText('h2')
    await page.keyboard.press('ArrowRight')
    await expect(activeCrumb(page)).toHaveText('p.product-card__price')
    await page.keyboard.press('ArrowLeft')
    await expect(activeCrumb(page)).toHaveText('h2')
    await page.keyboard.press('ArrowDown')
    await expect(activeCrumb(page)).toHaveText('h2')

    for (const crumb of ['article.product-card', 'section.grid', 'main', 'body']) {
      await page.keyboard.press('ArrowUp')
      await expect(activeCrumb(page)).toHaveText(crumb)
    }
    await page.keyboard.press('ArrowUp')
    await expect(activeCrumb(page)).toHaveText('body')
    await expect(page.getByTestId(TestId.PickerLockedChip)).toContainText('body ·')
    // The trail below stays while moving up (screens.md §05).
    await expect(page.getByTestId(TestId.PickerBreadcrumbs)).toContainText('h2')

    // A crumb locks its node; a page click elsewhere rebuilds the path.
    await page.getByTestId(testIds.pickerBreadcrumb(1)).click()
    await expect(activeCrumb(page)).toHaveText('main')
    await page.locator(CTA).nth(0).click()
    await expect(activeCrumb(page)).toHaveText('button.card__cta')
    await expect(page.getByTestId(TestId.PickerBreadcrumbs)).not.toContainText('h2')

    // Back in picking the arrows belong to the page again.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.PickerLockedBar)).toHaveCount(0)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })

  test('open shadow roots are entered, closed ones and iframes are picked as a whole', async () => {
    await activatePicker(page)

    await page.locator('[data-fixture="open-shadow-button"]').hover()
    await expect(page.getByTestId(TestId.PickerTooltipTag)).toHaveText('button')
    await page.locator('[data-fixture="open-shadow-button"]').click()
    // finder prefers the fixture's data attribute over the bare tag: both are unique in the root.
    await expect(page.getByTestId(TestId.PickerLockedChip)).toContainText(
      /^fx-open-card >>> (button|\[data-fixture="open-shadow-button"\]) · /,
    )
    await expect(page.getByTestId(TestId.PickerBreadcrumbs)).toContainText('fx-open-card')
    await page.keyboard.press('Escape')

    await page.locator('fx-closed-card').hover()
    await expect(page.getByTestId(TestId.PickerTooltipTag)).toHaveText('fx-closed-card')

    const iframe = page.locator('iframe.frame')
    await iframe.scrollIntoViewIfNeeded()
    const box = await iframe.boundingBox()
    if (!box) throw new Error('iframe not laid out')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId(TestId.PickerTooltipTag)).toHaveText('iframe.frame')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId(TestId.PickerLockedChip)).toContainText('.frame ·')
    await page.keyboard.press('ArrowDown')
    await expect(activeCrumb(page)).toHaveText('iframe.frame')
  })

  test('settings change the open tooltip without restarting the review', async () => {
    await activatePicker(page)
    await page.locator(CTA).first().hover()
    await expect(page.getByTestId(testIds.pickerRow('color'))).toContainText('#FFFFFF')
    await expect(page.getByTestId(testIds.pickerRow('padding'))).toBeVisible()

    const popup = await openPopup(context, await getTabId(context, page))
    await popup.getByTestId(TestId.PopupSettingsButton).click()
    await popup.getByTestId(testIds.segmentOption(TestId.SettingColorFormat, 'hsl')).click()
    await popup.getByTestId(testIds.segmentOption(TestId.SettingUnits, 'rem')).click()
    await popup.getByTestId(testIds.tooltipField('spacing')).click()

    // Opening the popup tab takes the pointer away from the page; hover again in the same review.
    await page.bringToFront()
    await page.mouse.move(0, 0)
    await page.locator(CTA).first().hover()
    await expect(page.getByTestId(testIds.pickerRow('color'))).toContainText('hsl(0, 0%, 100%)')
    await expect(page.getByTestId(testIds.pickerRow('font'))).toContainText('rem')
    await expect(page.getByTestId(testIds.pickerRow('padding'))).toHaveCount(0)
    await expect(page.getByTestId(testIds.pickerRow('content'))).toContainText('rem')
  })

  test('hover handler stays within a frame on a page with ~3000 nodes', async () => {
    await closePagesExcept(context, keeper)
    page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/heavy/`)
    expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBeGreaterThanOrEqual(
      3000,
    )
    await startReview(context, page)
    await activatePicker(page)

    await page.mouse.move(20, 140)
    await page.mouse.move(1260, 700, { steps: PERF_MOVE_STEPS })
    await page.mouse.move(40, 200, { steps: PERF_MOVE_STEPS })
    await expect(page.getByTestId(TestId.PickerTooltip)).toBeVisible()

    const host = page.locator(OVERLAY_HOST_TAG)
    await expect(host).toHaveAttribute('data-dr-e2e-pointermove', /p95/)
    const stats = JSON.parse(
      (await host.getAttribute('data-dr-e2e-pointermove')) ?? '{}',
    ) as PerfStats
    for (const [key, value] of Object.entries(stats)) {
      test.info().annotations.push({ type: `pointermove-${key}`, description: String(value) })
    }
    expect(stats.count).toBeGreaterThanOrEqual(20)
    if (!process.env.CI) expect(stats.p95).toBeLessThanOrEqual(HOVER_P95_BUDGET_MS)
  })
})
