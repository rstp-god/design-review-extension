import { expect, test } from '@playwright/test'
import {
  extensionUrl,
  getExtensionId,
  getServiceWorker,
  launchExtensionContext,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'

test('E2E build loads in Chromium: service worker registers, popup renders, fixture site answers', async () => {
  const context = await launchExtensionContext()

  try {
    const worker = await getServiceWorker(context)
    expect(worker.url()).toMatch(/^chrome-extension:\/\/[a-p]{32}\//)

    const page = await context.newPage()
    await page.goto(extensionUrl(await getExtensionId(context), 'src/popup/index.html'))
    await expect(page.getByRole('heading', { name: 'Design Review' })).toBeVisible()

    await page.goto(FIXTURE_SITE_URL)
    await expect(page).toHaveTitle(/fixture/i)
  } finally {
    await context.close()
  }
})
