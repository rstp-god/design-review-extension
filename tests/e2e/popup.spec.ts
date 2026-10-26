import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { TestId, testIds } from '@tests/constants/testIds'
import { makeFixtureIssues, makeFixtureSession, makeIssue, makeSession } from '@tests/fixtures/data'
import {
  clearExtensionStorage,
  getActiveTabId,
  getTabId,
  launchExtensionContext,
  openPopup,
  seedSessions,
} from '@tests/helpers/extension'
import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'
import { SETTINGS_KEY } from '@/shared/constants'

const fixtureDomain = makeFixtureSession()
const fixtureIssues = makeFixtureIssues()

const otherSite = makeSession({
  id: 'session-landing',
  scope: 'page',
  key: 'https://landing.example.ru/promo',
  origin: 'https://landing.example.ru',
  path: '/promo',
  title: 'Promo',
  updatedAt: '2026-01-14T18:00:00.000Z',
})

test.describe('popup', () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async () => {
    context = await launchExtensionContext()
  })

  test.afterAll(async () => {
    await context.close()
  })

  test.beforeEach(async () => {
    await clearExtensionStorage(context)
    page = await context.newPage()
    await page.goto(`${FIXTURE_SITE_URL}/catalog/`)
  })

  test.afterEach(async () => {
    for (const open of context.pages()) await open.close()
  })

  test('first run: onboarding, then start shows the toolbar on the tab', async () => {
    const popup = await openPopup(context, await getTabId(context, page))

    await expect(popup.getByTestId(TestId.PopupOnboarding)).toBeVisible()
    await expect(popup.getByTestId(TestId.PopupSessionHost)).toHaveText('localhost:4173')
    await expect(popup.getByTestId(TestId.PopupStart)).toBeEnabled()
    await expect(popup.getByTestId(TestId.PopupShortcut)).toContainText(/Alt|⌥/)
    await expect(popup.getByTestId(TestId.PopupRecent)).toHaveCount(0)
    await expect(popup.getByTestId(TestId.PopupRoot)).toHaveScreenshot('popup-first-run.png')

    const started = Date.now()
    await popup.getByTestId(TestId.PopupStart).click()
    await expect(page.getByTestId(TestId.Toolbar)).toBeVisible()
    const elapsed = Date.now() - started
    test.info().annotations.push({ type: 'toolbar-appeared-ms', description: String(elapsed) })
    expect(elapsed).toBeLessThan(2_000)
    await expect.poll(() => popup.isClosed()).toBe(true)
  })

  test('no session on this page: scope from settings, other sessions listed, no onboarding', async () => {
    await seedSessions(context, {
      sessions: [otherSite],
      issues: [makeIssue({ number: 1, sessionId: otherSite.id, id: 'ls-1', pagePath: '/promo' })],
    })
    const popup = await openPopup(context, await getTabId(context, page))

    await expect(popup.getByTestId(TestId.PopupOnboarding)).toHaveCount(0)
    await expect(popup.getByTestId(TestId.PopupSessionScope)).toHaveText(/By domain/)
    await expect(popup.getByTestId(TestId.PopupSessionSummary)).toHaveCount(0)
    await expect(popup.getByTestId(TestId.PopupStart)).toHaveText(/Start review/)
    const recent = popup.getByTestId(TestId.PopupRecent)
    await expect(recent.getByTestId(testIds.recentItem(otherSite.id))).toContainText(
      'landing.example.ru/promo',
    )
    await expect(recent.getByTestId(testIds.recentItem(otherSite.id))).toContainText(
      /By page · 1 issue · yesterday/,
    )
    await expect(recent.getByTestId(testIds.recentMenu(otherSite.id))).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await expect(popup.getByTestId(TestId.PopupRoot)).toHaveScreenshot('popup-home-no-session.png')
  })

  test('session on this page: summary, continue, export disabled', async () => {
    await seedSessions(context, { sessions: [fixtureDomain, otherSite], issues: fixtureIssues })
    const popup = await openPopup(context, await getTabId(context, page))

    await expect(popup.getByTestId(TestId.PopupSessionHost)).toHaveText('localhost:4173')
    await expect(popup.getByTestId(TestId.PopupSessionPath)).toHaveText('/catalog')
    const summary = popup.getByTestId(TestId.PopupSessionSummary)
    await expect(summary).toContainText('3 issues')
    await expect(summary).toContainText('2 pages')
    await expect(popup.getByTestId(TestId.PopupStart)).toHaveText(/Continue review/)
    await expect(popup.getByTestId(TestId.PopupExportHtml)).toHaveAttribute('aria-disabled', 'true')
    await expect(popup.getByTestId(TestId.PopupExportPdf)).toHaveAttribute('aria-disabled', 'true')
    await expect(popup.getByTestId(TestId.PopupRecent)).not.toContainText('localhost:4173')
    await expect(popup.getByTestId(TestId.PopupRecent)).toContainText('landing.example.ru/promo')
    await expect(popup.getByTestId(TestId.PopupRoot)).toHaveScreenshot('popup-home-session.png')
  })

  test('settings: every field renders, a change is saved to sync and survives reopening', async () => {
    await seedSessions(context, { sessions: [fixtureDomain], issues: fixtureIssues })
    const popup = await openPopup(context, await getTabId(context, page))

    await popup.getByTestId(TestId.PopupSettingsButton).click()
    const settings = popup.getByTestId(TestId.SettingsRoot)
    await expect(settings).toHaveAttribute('data-hydrated', 'true')
    await expect(popup.getByTestId(TestId.SettingsStorageUsage)).toContainText('1 session')
    await expect(popup.getByTestId(TestId.SettingsRoot)).toHaveScreenshot('popup-settings.png')

    await popup.getByTestId(testIds.segmentOption(TestId.SettingScope, 'page')).click()
    await popup.getByTestId(testIds.segmentOption(TestId.SettingTheme, 'light')).click()
    await expect
      .poll(async () => {
        const worker = context.serviceWorkers()[0]
        if (!worker) return null
        return worker.evaluate(async (key) => {
          const stored = await chrome.storage.sync.get(key)
          const envelope = stored[key] as
            | { state?: { sessionScope?: string; theme?: string } }
            | undefined
          return envelope?.state ? [envelope.state.sessionScope, envelope.state.theme] : null
        }, SETTINGS_KEY)
      })
      .toEqual(['page', 'light'])

    await popup.close()
    const reopened = await openPopup(context, await getTabId(context, page))
    // Page scope: the catalog page has no page-scoped session yet, so the home shows "Start".
    await expect(reopened.getByTestId(TestId.PopupSessionScope)).toHaveText(/By page/)
    await expect(reopened.getByTestId(TestId.PopupStart)).toHaveText(/Start review/)
    await reopened.getByTestId(TestId.PopupSettingsButton).click()
    await expect(
      reopened.getByTestId(testIds.segmentOption(TestId.SettingScope, 'page')).getByRole('radio'),
    ).toBeChecked()
  })

  test('restricted page: notice, start disabled, recent sessions still available', async () => {
    await seedSessions(context, { sessions: [fixtureDomain], issues: fixtureIssues })
    const internal = await context.newPage()
    await internal.goto('chrome://extensions/')
    await internal.bringToFront()
    const popup = await openPopup(context, await getActiveTabId(context))

    await expect(popup.getByTestId(TestId.PopupRestricted)).toContainText(
      'Reviews are not available here',
    )
    await expect(popup.getByTestId(TestId.PopupStart)).toBeDisabled()
    await expect(popup.getByTestId(TestId.PopupShortcut)).toHaveCount(0)
    await expect(popup.getByTestId(TestId.PopupOnboarding)).toHaveCount(0)
    await expect(popup.getByTestId(TestId.PopupRecent)).toContainText('localhost:4173')
    await expect(popup.getByTestId(TestId.PopupRoot)).toHaveScreenshot('popup-restricted.png')
  })
})
