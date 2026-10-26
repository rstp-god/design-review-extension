import { findTabsByUrl } from '@/services/chrome/tabs'
import type { Issue, ReviewSession } from '@/shared/model'
import { deleteAllSessions, putIssue, putSession } from './db'
import { startReview, stopReview } from './review'

/**
 * Test hook for Playwright, present ONLY in the E2E build (`VITE_E2E=1`): background/index.ts
 * imports this module behind a build-time constant and a contract test checks the production
 * bundle never mentions `__drE2E`.
 *
 * Playwright cannot click the extension action, so it starts reviews from the service worker,
 * looking tabs up by URL. Seeding writes straight to IndexedDB to set up popup states.
 */
export interface E2EHooks {
  tabIdFor: (url: string) => Promise<number>
  startReview: (url: string) => Promise<number>
  stopReview: (url: string) => Promise<void>
  seed: (data: { sessions?: ReviewSession[]; issues?: Issue[] }) => Promise<void>
  clearDb: () => Promise<void>
}

async function tabIdFor(url: string): Promise<number> {
  const [tab] = await findTabsByUrl(url)
  if (tab?.id === undefined) throw new Error(`No tab with url ${url}`)
  return tab.id
}

const hooks: E2EHooks = {
  tabIdFor,
  startReview: async (url) => {
    const tabId = await tabIdFor(url)
    await startReview(tabId, url)
    return tabId
  },
  stopReview: async (url) => {
    await stopReview(await tabIdFor(url))
  },
  seed: async ({ sessions = [], issues = [] }) => {
    for (const session of sessions) await putSession(session)
    for (const issue of issues) await putIssue(issue)
  },
  clearDb: () => deleteAllSessions(),
}

declare global {
  var __drE2E: E2EHooks | undefined
}

globalThis.__drE2E = hooks
