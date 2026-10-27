import { executeScriptFile } from '@/services/chrome/scripting'
import { CONTENT_SCRIPT_FILE } from '@/shared/constants'
import { MessageError, sendToTab } from '@/shared/messaging'

const STATUS_TIMEOUT_MS = 1_000

/**
 * Whether our overlay is mounted in the tab. Asks the content script instead of keeping state in
 * the worker: the worker is stopped when idle and would forget, the page would not.
 */
export async function isOverlayActive(tabId: number): Promise<boolean> {
  try {
    const { active } = await sendToTab(tabId, 'review/status', {}, { timeoutMs: STATUS_TIMEOUT_MS })
    return active
  } catch (error) {
    if (
      error instanceof MessageError &&
      (error.code === 'no-receiver' || error.code === 'timeout')
    ) {
      return false
    }
    throw error
  }
}

/**
 * Injects the content script once per document, into the isolated world only — nothing of ours
 * ever runs in the page's own realm. A race between the hotkey and the popup is resolved by the
 * script itself: it replaces a host it finds, so there is never a second overlay.
 */
export async function injectOverlay(tabId: number): Promise<void> {
  if (await isOverlayActive(tabId)) return
  await executeScriptFile(tabId, CONTENT_SCRIPT_FILE)
}
