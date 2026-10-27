import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import {
  clearExtensionStorage,
  closePagesExcept,
  launchExtensionContext,
  openKeeperPage,
  startReview,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'
import { installEventCounter, withFrozenPointer } from '@tests/helpers/pageEvents'
import { CORNERS, type Corner, type Point } from '@/content/area/geometry'
import { OVERLAY_HOST_TAG } from '@/shared/constants'

function near(actual: number | undefined, expected: number, tolerance = 1) {
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(tolerance)
}

test.describe('area', () => {
  let context: BrowserContext
  let keeper: Page
  let page: Page

  const selection = () => page.getByTestId(TestId.AreaSelection)
  const chip = () => page.getByTestId(TestId.AreaChip)
  const dim = () => page.getByTestId(TestId.AreaDim)
  const handle = (corner: Corner) => page.getByTestId(testIds.areaHandle(corner))

  async function activateArea() {
    await page.keyboard.press('a')
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'true')
  }

  /** The modifier is released after the button, as a hand does it: releasing it first redraws. */
  async function drag(from: Point, to: Point, modifier?: 'Shift' | 'Alt') {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    if (modifier) await page.keyboard.down(modifier)
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    if (modifier) await page.keyboard.up(modifier)
  }

  /** Drags a handle by its center. */
  async function dragHandle(corner: Corner, to: Point) {
    const box = await handle(corner).boundingBox()
    if (!box) throw new Error(`${corner} handle not laid out`)
    await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, to)
  }

  async function expectBox(expected: { x: number; y: number; w: number; h: number }) {
    const box = await selection().boundingBox()
    near(box?.x, expected.x)
    near(box?.y, expected.y)
    near(box?.width, expected.w)
    near(box?.height, expected.h)
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
    page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/`)
    await startReview(context, page)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
  })

  test.afterEach(async () => {
    await closePagesExcept(context, keeper)
  })

  test('A dims the page; a drag selects an area with handles, a chip and the actions', async () => {
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'false')
    await activateArea()
    await expect(dim()).toBeVisible()
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('Drag to select')
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('turn off area')
    await expect(page.getByTestId(TestId.Toolbar)).toHaveScreenshot('toolbar-area-active.png')

    await drag({ x: 200, y: 300 }, { x: 520, y: 460 })
    await expectBox({ x: 200, y: 300, w: 320, h: 160 })
    await expect(chip()).toHaveText('320 × 160 · x 200 y 300')
    await expect(dim()).toHaveCount(0)
    for (const corner of CORNERS) await expect(handle(corner)).toBeVisible()
    const se = await handle('se').boundingBox()
    near(se?.x, 515)
    near(se?.y, 455)
    near(se?.width, 10)

    const actions = page.getByTestId(TestId.AreaActions)
    await expect(actions).toBeVisible()
    const actionsBox = await actions.boundingBox()
    expect(actionsBox?.y ?? 0).toBeGreaterThanOrEqual(460 + 14)
    near((actionsBox?.x ?? 0) + (actionsBox?.width ?? 0), 520, 2)
    await expect(page.getByTestId(TestId.AreaIssue)).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId(TestId.AreaReselect)).toBeVisible()
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('cancel')

    // The pointer rests on the page after the drag; park it before the screenshots.
    await page.mouse.move(900, 150)
    await expect(page).toHaveScreenshot('area-selected.png', {
      clip: { x: 150, y: 250, width: 430, height: 300 },
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveAttribute('data-theme', 'light')
    await expect(page).toHaveScreenshot('area-selected-light.png', {
      clip: { x: 150, y: 250, width: 430, height: 300 },
    })

    await page.getByTestId(TestId.AreaIssue).hover()
    await expect(page.getByTestId(TestId.Tooltip)).toHaveText('Coming soon')
  })

  test('a drag in progress shows the rectangle and the live chip, no handles yet', async () => {
    await activateArea()
    await page.mouse.move(300, 320)
    await page.mouse.down()
    await page.mouse.move(500, 420, { steps: 4 })
    await expectBox({ x: 300, y: 320, w: 200, h: 100 })
    await expect(chip()).toHaveText('200 × 100 · x 300 y 320')
    await expect(handle('se')).toHaveCount(0)
    await expect(page.getByTestId(TestId.AreaActions)).toHaveCount(0)

    await withFrozenPointer(page, OVERLAY_HOST_TAG, () =>
      expect(page).toHaveScreenshot('area-drawing.png', {
        clip: { x: 260, y: 270, width: 300, height: 200 },
      }),
    )
    await page.mouse.up()
    await expect(handle('se')).toBeVisible()
  })

  test('a click-sized drag is ignored', async () => {
    await activateArea()
    await drag({ x: 300, y: 320 }, { x: 305, y: 326 })
    await expect(selection()).toHaveCount(0)
    await expect(dim()).toBeVisible()
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('turn off area')
  })

  test('Shift makes a square, Alt grows from the center', async () => {
    await activateArea()
    await drag({ x: 300, y: 300 }, { x: 500, y: 350 }, 'Shift')
    await expectBox({ x: 300, y: 300, w: 200, h: 200 })
    await expect(chip()).toHaveText('200 × 200 · x 300 y 300')

    await page.keyboard.press('Escape')
    await expect(selection()).toHaveCount(0)
    await drag({ x: 400, y: 300 }, { x: 500, y: 350 }, 'Alt')
    await expectBox({ x: 300, y: 250, w: 200, h: 100 })
    await expect(chip()).toHaveText('200 × 100 · x 300 y 250')
  })

  test('handles resize the area and invert through the opposite corner; Reselect starts over', async () => {
    await activateArea()
    await drag({ x: 200, y: 300 }, { x: 520, y: 460 })

    await dragHandle('se', { x: 600, y: 500 })
    await expectBox({ x: 200, y: 300, w: 400, h: 200 })
    await expect(chip()).toHaveText('400 × 200 · x 200 y 300')

    await dragHandle('nw', { x: 650, y: 540 })
    await expectBox({ x: 600, y: 500, w: 50, h: 40 })
    await expect(chip()).toHaveText('50 × 40 · x 600 y 500')
    for (const corner of CORNERS) await expect(handle(corner)).toBeVisible()

    await page.getByTestId(TestId.AreaReselect).click()
    await expect(selection()).toHaveCount(0)
    await expect(dim()).toBeVisible()
    await expect(page.getByTestId(TestId.OverlayHint)).toContainText('turn off area')
  })

  test('page clicks and text selection are blocked while the tool is active, and work again after', async () => {
    const counts = await installEventCounter(page)
    const counter = page.locator('[data-fixture="counter"]')
    const title = page.locator('[data-fixture="title"]')
    const counterBox = await counter.boundingBox()
    const titleBox = await title.boundingBox()
    if (!counterBox || !titleBox) throw new Error('fixture not laid out')
    const selectedText = () => page.evaluate(() => window.getSelection()?.toString() ?? '')

    await activateArea()
    await drag(
      { x: counterBox.x + 4, y: counterBox.y + 4 },
      { x: counterBox.x + counterBox.width + 40, y: counterBox.y + counterBox.height + 40 },
    )
    await expect(counter).toHaveText('Clicked 0')
    await expect(selection()).toBeVisible()
    await page.keyboard.press('Escape')
    await drag(
      { x: titleBox.x + 2, y: titleBox.y + titleBox.height / 2 },
      { x: titleBox.x + titleBox.width, y: titleBox.y + titleBox.height / 2 + 20 },
    )
    expect(await selectedText()).toBe('')
    await counter.click({ button: 'right' })
    expect(await counts()).toEqual({ click: 0, contextmenu: 0, mousedown: 0 })

    await page.keyboard.press('a')
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'false')
    await counter.click()
    await expect(counter).toHaveText('Clicked 1')
    await drag(
      { x: titleBox.x + 2, y: titleBox.y + titleBox.height / 2 },
      { x: titleBox.x + titleBox.width, y: titleBox.y + titleBox.height / 2 },
    )
    expect((await selectedText()).length).toBeGreaterThan(0)
  })

  test('P and A switch each other; Esc steps back through drawing, tool off and exit', async () => {
    await activateArea()
    await page.keyboard.press('p')
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'false')
    await expect(dim()).toHaveCount(0)
    await page.keyboard.press('a')
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId(TestId.ToolbarPicker)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId(TestId.PickerHighlight)).toHaveCount(0)

    await drag({ x: 200, y: 300 }, { x: 520, y: 460 })
    await expect(handle('se')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(selection()).toHaveCount(0)
    await expect(dim()).toBeVisible()
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'false')
    await expect(dim()).toHaveCount(0)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY_HOST_TAG)).toHaveCount(0)
  })

  test('the area is pinned to the viewport: the page scrolls underneath it', async () => {
    await activateArea()
    await drag({ x: 200, y: 300 }, { x: 520, y: 460 })
    const before = await selection().boundingBox()
    const handleBefore = await handle('se').boundingBox()

    await page.mouse.move(640, 600)
    await page.mouse.wheel(0, 300)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    expect(await selection().boundingBox()).toEqual(before)
    expect(await handle('se').boundingBox()).toEqual(handleBefore)
    await expect(chip()).toHaveText('320 × 160 · x 200 y 300')
    await expect(page.getByTestId(TestId.AreaActions)).toBeVisible()
  })
})
