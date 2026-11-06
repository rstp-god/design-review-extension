import { expect, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import { makeSettingsEnvelope } from '@tests/fixtures/data'
import {
  clearExtensionStorage,
  getServiceWorker,
  launchExtensionContext,
  startReview,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'

for (const frozen of [false, true]) {
  test(`creates an area issue from ${frozen ? 'snapshot' : 'live page'} and resumes session`, async () => {
    const context = await launchExtensionContext()
    try {
      await clearExtensionStorage(context)
      const page = await context.newPage()
      await page.goto(`${FIXTURE_SITE_URL}/`)
      await startReview(context, page)
      await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
      if (frozen) {
        await page.keyboard.press('f')
        await expect(page.getByTestId(TestId.SnapshotBadge)).toBeVisible()
      }
      await page.keyboard.press('a')
      await expect(page.getByTestId(TestId.ToolbarArea)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId(TestId.AreaDim)).toBeVisible()
      if (frozen) await expect(page.getByTestId(testIds.pickerShield(0))).toBeVisible()
      await page.mouse.move(200, 300)
      await page.mouse.down()
      await page.mouse.move(520, 460, { steps: 5 })
      await page.mouse.up()
      await expect(page.getByTestId(TestId.AreaIssue)).toBeEnabled()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('issue-frame')).toHaveAttribute('src', /chrome-extension:/)
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueForm),
      ).toBeVisible()
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueSave),
      ).toBeDisabled()
      await page
        .frameLocator('[data-testid="issue-frame"]')
        .getByTestId(TestId.IssueText)
        .fill('The spacing is wrong')
      await page.keyboard.press('Enter')
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueForm),
      ).toHaveCount(0)
      await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
      await expect(page.getByTestId(TestId.IssueMarker)).toHaveCount(1)
      await page.reload()
      await startReview(context, page)
      await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
      await expect(page.getByTestId(TestId.IssueMarker)).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
}

for (const frozen of [false, true]) {
  test(`saved crop uses clean ${frozen ? 'frozen' : 'live'} pixels at Retina scale`, async () => {
    const context = await launchExtensionContext({ deviceScaleFactor: 2 })
    try {
      await clearExtensionStorage(context)
      const page = await context.newPage()
      await page.goto(`${FIXTURE_SITE_URL}/`)
      await startReview(context, page)
      const toolbar = page.getByTestId(TestId.Toolbar)
      await expect(toolbar).toBeVisible()
      const box = await toolbar.boundingBox()
      if (!box) throw new Error('Missing toolbar')
      const sampleX = Math.round(box.x + box.width / 2)
      const sampleY = 30
      expect(sampleX).toBeGreaterThan(box.x)
      expect(sampleX).toBeLessThan(box.x + box.width)
      expect(sampleY).toBeGreaterThan(box.y)
      expect(sampleY).toBeLessThan(box.y + box.height)
      if (frozen) {
        await page.keyboard.press('f')
        await expect(page.getByTestId(TestId.SnapshotBadge)).toBeVisible()
        await page.evaluate(() => {
          const header = document.querySelector('header')
          if (header) header.style.background = 'rgb(220, 20, 20)'
        })
      }
      await page.keyboard.press('a')
      await expect(page.getByTestId(TestId.AreaDim)).toBeVisible()
      if (frozen) await expect(page.getByTestId(testIds.pickerShield(0))).toBeVisible()
      await page.mouse.move(20, 5)
      await page.mouse.down()
      await page.mouse.move(1270, 300, { steps: 5 })
      await page.mouse.up()
      await expect(page.getByTestId(TestId.AreaIssue)).toBeEnabled()
      await page.keyboard.press('Enter')
      await page
        .frameLocator('[data-testid="issue-frame"]')
        .getByTestId(TestId.IssueText)
        .fill('Pixel check')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
      const worker = await getServiceWorker(context)
      const pixel = await worker.evaluate(
        async ({ sampleX, sampleY }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('design-review')
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const get = <T>(request: IDBRequest<T>) =>
            new Promise<T>((resolve, reject) => {
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
          const tx = db.transaction(['issues', 'blobs'], 'readonly')
          const [issue] = await get(tx.objectStore('issues').getAll())
          const record = await get(tx.objectStore('blobs').get(issue.shots.cropId))
          const bitmap = await createImageBitmap(record.blob)
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('No canvas')
          ctx.drawImage(bitmap, 0, 0)
          const rect = issue.target.rect
          const left = Math.max(0, rect.x - 24)
          const top = Math.max(0, rect.y - 24)
          const width = Math.min(issue.env.viewport.w, rect.x + rect.w + 24) - left
          const height = Math.min(issue.env.viewport.h, rect.y + rect.h + 24) - top
          const x = Math.floor(((sampleX - left) * bitmap.width) / width)
          const y = Math.floor(((sampleY - top) * bitmap.height) / height)
          const rgba = [...ctx.getImageData(x, y, 1, 1).data]
          const scale = bitmap.width / width
          bitmap.close()
          db.close()
          return { rgba, scale }
        },
        { sampleX, sampleY },
      )
      // Linux's captureVisibleTab can still return a 1x bitmap for a 2x emulated viewport.
      // Assert the actual scale rather than treating deviceScaleFactor as capture scale.
      if (test.info().project.name === 'chromium-mac') expect(pixel.scale).toBeGreaterThan(1.5)
      else expect(pixel.scale).toBeGreaterThan(0)
      expect(pixel.rgba[0]).toBeLessThan(50)
      expect(pixel.rgba[1]).toBeGreaterThan(40)
      expect(pixel.rgba[2]).toBeGreaterThan(75)
    } finally {
      await context.close()
    }
  })
}

for (const frozen of [false, true])
  test(`element issue supports multiline text and cancellation (${frozen ? 'snapshot' : 'live'})`, async () => {
    const context = await launchExtensionContext()
    try {
      await clearExtensionStorage(context)
      const page = await context.newPage()
      await page.goto(`${FIXTURE_SITE_URL}/`)
      await page.evaluate(() => {
        const captured: string[] = []
        Object.assign(window, { testPageKeys: captured })
        window.addEventListener('keydown', (event) => captured.push(event.key), true)
      })
      await startReview(context, page)
      await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
      if (frozen) {
        await page.keyboard.press('f')
        await expect(page.getByTestId(TestId.SnapshotBadge)).toBeVisible()
      }
      await page.keyboard.press('p')
      const heading = page.locator('[data-fixture="title"]')
      const box = await heading.boundingBox()
      if (!box) throw new Error('Missing fixture heading')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(page.getByTestId(TestId.PickerLockedFrame)).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueForm),
      ).toBeVisible()
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueStyles),
      ).toBeVisible()
      await page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueText).fill('')
      await page.evaluate(() => {
        ;(window as unknown as { testPageKeys: string[] }).testPageKeys.length = 0
      })
      await page.keyboard.type('One')
      expect(
        await page.evaluate(() => (window as unknown as { testPageKeys: string[] }).testPageKeys),
      ).toEqual([])
      await page.keyboard.press('Shift+Enter')
      await page.keyboard.type('Two')
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueText),
      ).toHaveValue('One\nTwo')
      await page.keyboard.press('Escape')
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueForm),
      ).toHaveCount(0)
      await page.keyboard.press('Enter')
      await page
        .frameLocator('[data-testid="issue-frame"]')
        .getByTestId(TestId.IssueText)
        .fill('Element issue')
      await page.keyboard.press('Enter')
      await expect(
        page.frameLocator('[data-testid="issue-frame"]').getByTestId(TestId.IssueForm),
      ).toHaveCount(0)
      await expect(page.getByTestId(TestId.IssueMarker)).toHaveCount(1)
    } finally {
      await context.close()
    }
  })

for (const scope of ['domain', 'page'] as const) {
  test(`SPA switches marker visibility and ${scope} session count`, async () => {
    const context = await launchExtensionContext()
    try {
      await clearExtensionStorage(context)
      const worker = await getServiceWorker(context)
      const envelope = makeSettingsEnvelope({ sessionScope: scope })
      await worker.evaluate(async (value) => chrome.storage.sync.set({ settings: value }), envelope)
      const page = await context.newPage()
      await page.goto(`${FIXTURE_SITE_URL}/spa/`)
      await startReview(context, page)
      await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
      await page.keyboard.press('a')
      await expect(page.getByTestId(TestId.AreaDim)).toBeVisible()
      await page.mouse.move(200, 300)
      await page.mouse.down()
      await page.mouse.move(520, 460, { steps: 5 })
      await page.mouse.up()
      await expect(page.getByTestId(TestId.AreaIssue)).toBeEnabled()
      await page.keyboard.press('Enter')
      await page
        .frameLocator('[data-testid="issue-frame"]')
        .getByTestId(TestId.IssueText)
        .fill('SPA issue')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
      await page.evaluate(() => history.pushState({}, '', '/spa/products'))
      await expect(page.getByTestId(TestId.IssueMarker)).toHaveCount(0)
      if (scope === 'page') await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveCount(0)
      else await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
      await page.evaluate(() => history.pushState({}, '', '/spa/'))
      await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
      await expect(page.getByTestId(TestId.IssueMarker)).toHaveCount(1)
    } finally {
      await context.close()
    }
  })
}

test('warns when a selected element disappears and keeps its last position', async () => {
  const context = await launchExtensionContext()
  try {
    await clearExtensionStorage(context)
    const page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/`)
    await startReview(context, page)
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    await page.keyboard.press('p')
    const heading = page.locator('[data-fixture="title"]')
    const box = await heading.boundingBox()
    if (!box) throw new Error('Missing fixture heading')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId(TestId.PickerLockedFrame)).toBeVisible()
    await page.keyboard.press('Enter')
    const form = page.frameLocator('[data-testid="issue-frame"]')
    await expect(form.getByTestId(TestId.IssueForm)).toBeVisible()
    await heading.evaluate((element) => element.remove())
    await expect(form.getByRole('status')).toContainText('disappeared')
    await form.getByTestId(TestId.IssueText).fill('Gone')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
  } finally {
    await context.close()
  }
})
