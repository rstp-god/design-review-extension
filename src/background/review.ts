import { getUILanguage } from '@/services/chrome/i18n'
import { getTab } from '@/services/chrome/tabs'
import { MessageError, sendToTab } from '@/shared/messaging'
import { isRestrictedUrl, sessionKey } from '@/shared/sessionKey'
import { readSettings } from '@/store/settingsStorage'
import { getSessionSummaryByKey } from './db'
import { injectOverlay, isOverlayActive } from './inject'

export class RestrictedPageError extends Error {
  constructor() {
    super('Reviews are not available on this page')
    this.name = 'RestrictedPageError'
  }
}

async function resolveUrl(tabId: number, url?: string): Promise<string> {
  const pageUrl = url ?? (await getTab(tabId))?.url
  if (!pageUrl || isRestrictedUrl(pageUrl)) throw new RestrictedPageError()
  return pageUrl
}

/**
 * Start (or resume) a review on a tab: inject the overlay if needed, then open it with the
 * session for the current collection scope (F1.4). Sessions are created later, by the first
 * issue, so `session` may be `null`.
 */
export async function startReview(tabId: number, url?: string): Promise<void> {
  const pageUrl = await resolveUrl(tabId, url)
  await injectOverlay(tabId)

  const settings = await readSettings(getUILanguage())
  const session = await getSessionSummaryByKey(
    settings.sessionScope,
    sessionKey(pageUrl, settings.sessionScope),
  )
  await sendToTab(tabId, 'review/open', { session })
}

/** Asks the overlay to tear itself down. A tab without the overlay is already "stopped". */
export async function stopReview(tabId: number): Promise<void> {
  try {
    await sendToTab(tabId, 'review/close', {}, { timeoutMs: 1_000 })
  } catch (error) {
    if (error instanceof MessageError && error.code === 'no-receiver') return
    throw error
  }
}

export type ToggleResult = 'started' | 'stopped'

/** The `Alt+Shift+R` command: stop when the overlay is up, start otherwise. */
export async function toggleReview(tabId: number, url?: string): Promise<ToggleResult> {
  if (await isOverlayActive(tabId)) {
    await stopReview(tabId)
    return 'stopped'
  }
  await startReview(tabId, url)
  return 'started'
}
