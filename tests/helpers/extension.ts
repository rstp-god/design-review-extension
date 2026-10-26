import fs from 'node:fs'
import path from 'node:path'
import { type BrowserContext, chromium, type Page, type Worker } from '@playwright/test'

export const EXTENSION_VIEWPORT = { width: 1280, height: 720 }

/** Frozen clock for deterministic timestamps and screenshots. */
const FIXED_TIME_ISO = '2026-01-15T09:00:00.000Z'

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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  })
}

/** Resolves once the extension's MV3 service worker is registered. */
export async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers()[0]
  return existing ?? (await context.waitForEvent('serviceworker'))
}

export async function getExtensionId(context: BrowserContext): Promise<string> {
  const worker = await getServiceWorker(context)
  return new URL(worker.url()).host
}

export function extensionUrl(extensionId: string, pathname: string): string {
  return `chrome-extension://${extensionId}/${pathname.replace(/^\//, '')}`
}

/**
 * Clear BOTH storage areas between scenarios. Settings live in `chrome.storage.sync`, the
 * toolbar position in `chrome.storage.local`; clearing only one leaks state across runs.
 * IndexedDB (sessions, screenshots) is cleared through the background once it exists.
 */
export async function clearExtensionStorage(context: BrowserContext): Promise<void> {
  const worker = await getServiceWorker(context)

  await worker.evaluate(async () => {
    // The `storage` permission arrives with feature/extension-shell; until then nothing to clear.
    if (typeof chrome === 'undefined' || !chrome.storage) return
    await Promise.all([chrome.storage.local.clear(), chrome.storage.sync.clear()])
  })
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
