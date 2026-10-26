import { TOGGLE_REVIEW_COMMAND } from '@/shared/constants'
import { RestrictedPageError, toggleReview } from './review'

/** `chrome.commands.onCommand` handler: the global start / stop hotkey (spec 3.11). */
export async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (command !== TOGGLE_REVIEW_COMMAND || tab?.id === undefined) return

  try {
    await toggleReview(tab.id, tab.url)
  } catch (error) {
    // Nothing to show from a worker: a restricted page is expected, anything else is logged.
    if (error instanceof RestrictedPageError) return
    console.warn('[commands] toggle-review failed:', error instanceof Error ? error.message : error)
  }
}
