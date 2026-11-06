import { expect, test } from '@playwright/test'
import { TestId } from '@tests/constants/testIds'
import { makeFixtureIssues, makeFixtureSession, makeSettingsEnvelope } from '@tests/fixtures/data'
import {
  clearExtensionStorage,
  getServiceWorker,
  launchExtensionContext,
  seedSessions,
  startReview,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'

test('filters, edits, deletes and restores a grouped domain session', async () => {
  const context = await launchExtensionContext()
  try {
    await clearExtensionStorage(context)
    const issues = makeFixtureIssues().map((issue) => ({
      ...issue,
      pageUrl: `${FIXTURE_SITE_URL}${issue.pagePath}`,
    }))
    await seedSessions(context, { sessions: [makeFixtureSession()], issues })
    const page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/catalog`)
    await startReview(context, page)
    await page.getByTestId(TestId.ToolbarIssues).click()
    await expect(page.getByTestId('issue-card')).toHaveCount(2)
    await page.getByTestId('issues-filter-blocker').click()
    await expect(page.getByTestId('issue-card')).toHaveCount(1)
    await page.getByTestId('issues-filter-all').click()
    await page.getByTestId('issue-edit').first().click()
    const frame = page.frameLocator('[data-testid="issue-frame"]')
    await expect(frame.getByTestId(TestId.IssueText)).toHaveValue('Button is misaligned')
    await frame.getByTestId(TestId.IssueText).fill('Changed issue')
    await frame.getByTestId(TestId.IssueSeverity).selectOption('minor')
    await frame.getByTestId(TestId.IssueSave).click()
    await expect(frame.getByTestId(TestId.IssueForm)).toHaveCount(0)
    await expect(page.getByTestId('issue-card').first()).toContainText('Changed issue')
    await page.getByTestId('issues-scope-site').click()
    await expect(page.getByTestId('issue-card')).toHaveCount(3)
    await expect(page.getByTestId('issues-panel')).toContainText('/cart')
    await page.getByTestId('issue-delete').first().click()
    await page.getByTestId('issue-delete-confirm').click()
    await expect(page.getByTestId('issue-card')).toHaveCount(2)
    await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('2')
    await page.reload()
    await startReview(context, page)
    await page.getByTestId(TestId.ToolbarIssues).click()
    await expect(page.getByTestId('issue-card')).toHaveCount(1)
    await page.getByTestId('issues-scope-site').click()
    await expect(page.getByTestId('issue-card')).toHaveCount(2)
    await page.getByTestId('issue-card-open').last().click()
    await expect(page.getByRole('link', { name: `${FIXTURE_SITE_URL}/cart` })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('shows saved crop after reload and does not reuse a deleted number', async () => {
  const context = await launchExtensionContext()
  try {
    await clearExtensionStorage(context)
    const page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/catalog`)
    await startReview(context, page)
    async function createArea(text: string) {
      await page.keyboard.press('a')
      await page.mouse.move(80, 200)
      await page.mouse.down()
      await page.mouse.move(220, 300)
      await page.mouse.up()
      await page.keyboard.press('Enter')
      const frame = page.frameLocator('[data-testid="issue-frame"]')
      await frame.getByTestId(TestId.IssueText).fill(text)
      await frame.getByTestId(TestId.IssueText).press('Enter')
      await expect(page.getByTestId('issue-frame')).toHaveCount(0)
      await page.keyboard.press('a')
    }
    await createArea('Saved crop')
    await page.reload()
    await startReview(context, page)
    await page.getByTestId(TestId.ToolbarIssues).click()
    await expect(page.getByTestId('issue-card').locator('img')).toHaveAttribute(
      'src',
      /^data:image\/webp;base64,/,
    )
    await page.getByTestId('issue-card-open').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('issue-delete').click()
    await page.getByTestId('issue-delete-confirm').click()
    await expect(page.getByTestId('issue-card')).toHaveCount(0)
    await page.getByTestId('issues-close').click()
    await createArea('Next number')
    await page.getByTestId(TestId.ToolbarIssues).click()
    await expect(page.getByTestId('issue-card')).toContainText('2')
  } finally {
    await context.close()
  }
})

test('locates the original node and falls back to crop when it is replaced', async () => {
  const context = await launchExtensionContext()
  try {
    await clearExtensionStorage(context)
    const page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/`)
    await startReview(context, page)
    await page.keyboard.press('p')
    const heading = page.locator('[data-fixture="title"]')
    const box = await heading.boundingBox()
    if (!box) throw new Error('Missing heading')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.press('Enter')
    const frame = page.frameLocator('[data-testid="issue-frame"]')
    await frame.getByTestId(TestId.IssueText).fill('Original element')
    await frame.getByTestId(TestId.IssueText).press('Enter')
    await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
    await page.keyboard.press('p')
    await page.getByTestId(TestId.ToolbarIssues).click()
    await page.getByTestId(TestId.IssueCardOpen).click()
    await expect(page.getByTestId(TestId.IssueHighlight)).toBeVisible()
    await heading.evaluate((node) => node.replaceWith(node.cloneNode(true)))
    await page.getByTestId(TestId.IssueCardOpen).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(TestId.IssuesPanel)).toHaveCount(0)
    await expect(page.getByTestId(TestId.ToolbarIssues)).toBeFocused()
  } finally {
    await context.close()
  }
})

test('switches pages in a domain session and hides scope control in a page session', async () => {
  const context = await launchExtensionContext()
  try {
    await clearExtensionStorage(context)
    const page = await context.newPage()
    const issues = makeFixtureIssues().map((issue) => ({
      ...issue,
      pageUrl: `${FIXTURE_SITE_URL}${issue.pagePath}`,
    }))
    await seedSessions(context, { sessions: [makeFixtureSession()], issues })
    await page.goto(`${FIXTURE_SITE_URL}/catalog`)
    await startReview(context, page)
    await page.getByTestId(TestId.ToolbarIssues).click()
    await expect(page.getByTestId(TestId.IssueCard)).toHaveCount(2)
    await page.goto(`${FIXTURE_SITE_URL}/cart`)
    await startReview(context, page)
    await page.getByTestId(TestId.ToolbarIssues).click()
    await expect(page.getByTestId(TestId.IssueCard)).toHaveCount(1)
    await page.getByTestId(TestId.IssuesScopeSite).click()
    await expect(page.getByTestId(TestId.IssueCard)).toHaveCount(3)
    await clearExtensionStorage(context)
    await page.reload()
    const worker = await getServiceWorker(context)
    await worker.evaluate(
      async (settings) => chrome.storage.sync.set({ settings }),
      makeSettingsEnvelope({ sessionScope: 'page' }),
    )
    await seedSessions(context, {
      sessions: [
        makeFixtureSession({ scope: 'page', key: `${FIXTURE_SITE_URL}/cart`, path: '/cart' }),
      ],
      issues: issues.filter((issue) => issue.pagePath === '/cart'),
    })
    await startReview(context, page)
    await page.getByTestId(TestId.ToolbarIssues).click()
    await expect(page.getByTestId(TestId.IssueCard)).toHaveCount(1)
    await expect(page.getByTestId(TestId.IssuesScopeSite)).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('renders a crop under a restrictive page image policy', async () => {
  const context = await launchExtensionContext()
  try {
    await clearExtensionStorage(context)
    const page = await context.newPage()
    await page.route('**/csp-panel', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: { 'content-security-policy': "default-src 'self'; img-src 'self'" },
        body: '<!doctype html><title>CSP</title><main>Content</main>',
      }),
    )
    await page.goto(`${FIXTURE_SITE_URL}/csp-panel`)
    await startReview(context, page)
    await page.keyboard.press('a')
    await page.mouse.move(80, 180)
    await page.mouse.down()
    await page.mouse.move(220, 280)
    await page.mouse.up()
    await page.keyboard.press('Enter')
    const frame = page.frameLocator('[data-testid="issue-frame"]')
    await frame.getByTestId(TestId.IssueText).fill('CSP crop')
    await frame.getByTestId(TestId.IssueText).press('Enter')
    await expect(page.getByTestId(TestId.ToolbarIssuesBadge)).toHaveText('1')
    await page.keyboard.press('a')
    await page.getByTestId(TestId.ToolbarIssues).click()
    const image = page.getByTestId(TestId.IssueCard).locator('img')
    await expect(image).toBeVisible()
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0)
  } finally {
    await context.close()
  }
})
