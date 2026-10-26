import { findTabsByUrl, queryLastFocusedActiveTab } from '@/services/chrome/tabs'
import type { Issue, ReviewSession } from '@/shared/model'
import { deleteAllSessions, putIssue, putSession } from './db'
import { startReview, stopReview } from './review'

/**
 * Test hook for Playwright, present ONLY in the E2E build (`VITE_E2E=1`): background/index.ts
 * calls `installE2EHooks` behind a build-time constant, so in production the call — and with it
 * this whole module — is dead code. A contract test checks the production bundle never mentions
 * `__drE2E`. (A dynamic `import()` is not an option: service workers do not support it.)
 *
 * Playwright cannot click the extension action, so it starts reviews from the service worker,
 * looking tabs up by URL. Seeding writes straight to IndexedDB to set up popup states.
 */
export interface E2EHooks {
  tabIdFor: (url: string) => Promise<number>
  /** For pages whose URL the worker cannot see (`chrome://`): the active tab of the window. */
  activeTabId: () => Promise<number>
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
  activeTabId: async () => {
    const tab = await queryLastFocusedActiveTab()
    if (tab?.id === undefined) throw new Error('No active tab')
    return tab.id
  },
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

export function installE2EHooks(): void {
  globalThis.__drE2E = hooks
}
