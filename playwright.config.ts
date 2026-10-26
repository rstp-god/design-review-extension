import { defineConfig, devices } from '@playwright/test'
import { FIXTURE_SITE_PORT, FIXTURE_SITE_URL } from './tests/helpers/fixtureSite'

/**
 * Two identical projects exist only to keep visual baselines per environment:
 * `chromium-mac` for local runs, `chromium-ci` for the Linux container (see tests.yml).
 * Baselines live next to each spec under `<project>/`; never refresh `chromium-ci` from a Mac.
 */
const desktopChrome = {
  ...devices['Desktop Chrome'],
  locale: 'en-US',
  timezoneId: 'UTC',
}

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: '{testDir}/{testFileDir}/{projectName}/{arg}{ext}',
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Tolerate sub-pixel anti-aliasing drift between otherwise identical renders.
      maxDiffPixelRatio: 0.005,
    },
  },
  use: {
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'node tests/fixtures/serve.mjs',
    env: { FIXTURE_PORT: String(FIXTURE_SITE_PORT) },
    url: FIXTURE_SITE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium-mac', use: desktopChrome },
    { name: 'chromium-ci', use: desktopChrome },
  ],
})
