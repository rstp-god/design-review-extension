import { FIXTURE_SITE_URL } from '@tests/helpers/fixtureSite'
import type { Issue, ReviewSession, Settings } from '@/shared/model'
import { defaultSettings } from '@/shared/model'

/** Deterministic records for unit and E2E tests. Override what the scenario cares about. */

export function makeSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    id: 'session-shop',
    scope: 'domain',
    key: 'https://shop.example.ru',
    origin: 'https://shop.example.ru',
    title: 'shop.example.ru',
    createdAt: '2026-01-14T10:00:00.000Z',
    updatedAt: '2026-01-14T12:00:00.000Z',
    nextNumber: 1,
    ...overrides,
  }
}

export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  const number = overrides.number ?? 1
  return {
    id: `issue-${number}`,
    sessionId: 'session-shop',
    number,
    pageUrl: 'https://shop.example.ru/catalog',
    pagePath: '/catalog',
    pageTitle: 'Catalog',
    env: { viewport: { w: 1280, h: 720 }, dpr: 1, userAgent: 'test' },
    severity: 'major',
    text: 'Button is misaligned',
    target: {
      kind: 'element',
      selector: '.card__cta',
      path: ['main', 'section'],
      rect: { x: 10, y: 20, w: 100, h: 40 },
    },
    source: 'live',
    scroll: { x: 0, y: 0 },
    shots: { cropId: `crop-${number}`, viewportId: `viewport-${number}` },
    status: 'open',
    createdAt: '2026-01-14T11:00:00.000Z',
    updatedAt: '2026-01-14T11:00:00.000Z',
    ...overrides,
  }
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings('en'), ...overrides }
}

/** Domain session of the Playwright fixture site, with three issues on two pages. */
export const FIXTURE_SESSION_ID = 'session-fixture'

export function makeFixtureSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return makeSession({
    id: FIXTURE_SESSION_ID,
    key: FIXTURE_SITE_URL,
    origin: FIXTURE_SITE_URL,
    title: new URL(FIXTURE_SITE_URL).host,
    updatedAt: '2026-01-14T12:00:00.000Z',
    nextNumber: 4,
    ...overrides,
  })
}

export function makeFixtureIssues(): Issue[] {
  return [
    makeIssue({
      number: 1,
      id: 'fx-1',
      sessionId: FIXTURE_SESSION_ID,
      severity: 'blocker',
      pagePath: '/catalog',
    }),
    makeIssue({
      number: 2,
      id: 'fx-2',
      sessionId: FIXTURE_SESSION_ID,
      severity: 'major',
      pagePath: '/catalog',
    }),
    makeIssue({
      number: 3,
      id: 'fx-3',
      sessionId: FIXTURE_SESSION_ID,
      severity: 'minor',
      pagePath: '/cart',
    }),
  ]
}

/** A settings envelope as `chrome.storage.sync` holds it. */
export function makeSettingsEnvelope(state: Partial<Settings> = {}, rev = 1) {
  return { meta: { originId: 'seed', rev, ts: 1_700_000_000_000 }, state: makeSettings(state) }
}
