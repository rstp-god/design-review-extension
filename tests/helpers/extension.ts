import fs from 'node:fs'
import path from 'node:path'
import { type BrowserContext, chromium, type Page, type Worker } from '@playwright/test'
import type { E2EHooks } from '@/background/e2e'
import type { Issue, ReviewSession } from '@/shared/model'
import { TestId } from '../constants/testIds'

export const EXTENSION_VIEWPORT = { width: 1280, height: 720 }
export const POPUP_VIEWPORT = { width: 380, height: 600 }

/** Frozen clock for deterministic timestamps and screenshots ("yesterday" stays yesterday). */
export const FIXED_TIME_ISO = '2026-01-15T09:00:00.000Z'

/** Playwright always loads the E2E build (`yarn build:e2e`), never `dist/`. */
export function getDistDir(): string {
  return path.resolve(process.cwd(), 'dist-e2e')
}

export function ensureExtensionBuildExists(): void {
  const manifestPath = path.join(getDistDir(), 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      'dist-e2e/manifest.json not found. Run `yarn build:e2e` before Playwright tests.',
    )
  }
}

/**
 * Chromium with the extension loaded. Extensions need a persistent context and a headed
 * browser; CI wraps the run in `xvfb-run` (see the `*:ci` scripts).
 */
export async function launchExtensionContext(): Promise<BrowserContext> {
  ensureExtensionBuildExists()
  const distDir = getDistDir()

  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    viewport: EXTENSION_VIEWPORT,
    locale: 'en-US',
    timezoneId: 'UTC',
    // The toolbar follows the OS scheme in its default "system" mode; the mockups are dark.
    colorScheme: 'dark',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--lang=en-US',
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  })
}

/**
 * A persistent Chromium context shuts down when its last page closes (seen on Linux). Specs keep
 * one blank page open for the whole file and close everything else between scenarios.
 */
export async function openKeeperPage(context: BrowserContext): Promise<Page> {
  const keeper = await context.newPage()
  await keeper.goto('about:blank')
  return keeper
}

export async function closePagesExcept(context: BrowserContext, keeper: Page): Promise<void> {
  for (const page of context.pages()) {
    if (page !== keeper && !page.isClosed()) await page.close()
  }
}

/**
 * Resolves once the extension's MV3 service worker is running.
 *
 * Fails fast instead of hanging until the test timeout when no worker is running and none
 * registers soon: Chrome stops idle MV3 workers after ~30 s, so a scenario that waited on a page
 * must wake the worker (open an extension page, send a runtime message) before calling this.
 */
export async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers()[0]
  if (existing) return existing

  try {
    return await context.waitForEvent('serviceworker', { timeout: 10_000 })
  } catch (error) {
    throw new Error(
      'Extension service worker is not running and did not start within 10 s. It may have gone idle; wake it before calling getServiceWorker().',
      { cause: error },
    )
  }
}

export async function getExtensionId(context: BrowserContext): Promise<string> {
  const worker = await getServiceWorker(context)
  return new URL(worker.url()).host
}

export function extensionUrl(extensionId: string, pathname: string): string {
  return `chrome-extension://${extensionId}/${pathname.replace(/^\//, '')}`
}

type HookName = keyof E2EHooks
type HookArg<Name extends HookName> = Parameters<E2EHooks[Name]>[0]
type HookResult<Name extends HookName> = Awaited<ReturnType<E2EHooks[Name]>>

/** Calls a `__drE2E` hook inside the service worker (E2E build only). */
export async function callHook<Name extends HookName>(
  context: BrowserContext,
  name: Name,
  arg: HookArg<Name>,
): Promise<HookResult<Name>> {
  const worker = await getServiceWorker(context)
  return worker.evaluate(
    async ([hookName, hookArg]) => {
      const hooks = (globalThis as unknown as { __drE2E?: E2EHooks }).__drE2E
      if (!hooks) throw new Error('__drE2E is missing: is this the E2E build?')
      const hook = hooks[hookName as HookName] as (input: unknown) => Promise<unknown>
      return hook(hookArg)
    },
    [name, arg] as const,
  ) as Promise<HookResult<Name>>
}

/** Tab id of a Playwright page, resolved through the worker by URL. */
export function getTabId(context: BrowserContext, page: Page): Promise<number> {
  return callHook(context, 'tabIdFor', page.url())
}

/** Tab id of the active tab — for `chrome://` pages, whose URL the worker cannot query. */
export function getActiveTabId(context: BrowserContext): Promise<number> {
  return callHook(context, 'activeTabId', undefined as never)
}

/** Starts (or resumes) a review on the page exactly like the popup button would. */
export function startReview(context: BrowserContext, page: Page): Promise<number> {
  return callHook(context, 'startReview', page.url())
}

export function stopReview(context: BrowserContext, page: Page): Promise<void> {
  return callHook(context, 'stopReview', page.url())
}

export function seedSessions(
  context: BrowserContext,
  data: { sessions?: ReviewSession[]; issues?: Issue[] },
): Promise<void> {
  return callHook(context, 'seed', data)
}

/**
 * Clears everything between scenarios: `chrome.storage.sync` (settings), `chrome.storage.local`
 * (toolbar position) and IndexedDB (sessions). Leaving any of them leaks state across runs.
 */
export async function clearExtensionStorage(context: BrowserContext): Promise<void> {
  const worker = await getServiceWorker(context)
  await worker.evaluate(async () => {
    await Promise.all([chrome.storage.local.clear(), chrome.storage.sync.clear()])
  })
  await callHook(context, 'clearDb', undefined as never)
}

/** Pins `Date` to a fixed instant in the page so timestamps and screenshots are reproducible. */
export async function installDeterministicPageState(page: Page): Promise<void> {
  await page.addInitScript((fixedTimeIso) => {
    const RealDate = Date
    const fixedTimestamp = new RealDate(fixedTimeIso).valueOf()

    class MockDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedTimestamp)
          return
        }

        super(...(args as ConstructorParameters<typeof Date>))
      }

      static now() {
        return fixedTimestamp
      }
    }

    MockDate.UTC = RealDate.UTC
    MockDate.parse = RealDate.parse
    globalThis.Date = MockDate as unknown as DateConstructor
  }, FIXED_TIME_ISO)
}

/**
 * Opens the popup as a page with the real popup size, pointed at `tabId` (`?tab=` is honoured by
 * the E2E build only). Resolves once the data loaded and the bundled fonts are ready, so
 * screenshots are stable.
 */
export async function openPopup(context: BrowserContext, tabId: number): Promise<Page> {
  const extensionId = await getExtensionId(context)
  const popup = await context.newPage()
  await popup.setViewportSize(POPUP_VIEWPORT)
  await installDeterministicPageState(popup)
  await popup.goto(extensionUrl(extensionId, `src/popup/index.html?tab=${tabId}`))
  await popup.getByTestId(TestId.PopupRoot).waitFor()
  await popup.locator(`[data-testid="${TestId.PopupRoot}"][data-status="ready"]`).waitFor()
  await popup.evaluate(() => document.fonts.ready)
  return popup
}
