import { captureVisibleTab, getTab } from '@/services/chrome/tabs'

/**
 * Chrome allows about two `captureVisibleTab` calls per second per extension
 * (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`); a third one fails with a quota error instead of
 * waiting. Captures are therefore serialized through one queue that keeps this distance between
 * attempts and retries a quota failure after a pause rather than surfacing it.
 */
export const CAPTURE_MIN_INTERVAL_MS = 500
export const CAPTURE_RETRY_DELAY_MS = 600
export const CAPTURE_MAX_ATTEMPTS = 3

const QUOTA_ERROR = /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i

export function isCaptureQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return QUOTA_ERROR.test(message)
}

export interface CaptureQueueOptions {
  /** The capture itself; `chrome.tabs.captureVisibleTab` in production, a stub in tests. */
  capture?: (windowId: number) => Promise<string>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  minIntervalMs?: number
  retryDelayMs?: number
  maxAttempts?: number
}

export interface CaptureQueue {
  /** PNG data URL of the visible area of the window's active tab. */
  capture(windowId: number): Promise<string>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createCaptureQueue({
  capture = captureVisibleTab,
  now = () => Date.now(),
  sleep = defaultSleep,
  minIntervalMs = CAPTURE_MIN_INTERVAL_MS,
  retryDelayMs = CAPTURE_RETRY_DELAY_MS,
  maxAttempts = CAPTURE_MAX_ATTEMPTS,
}: CaptureQueueOptions = {}): CaptureQueue {
  let tail: Promise<unknown> = Promise.resolve()
  let lastAttemptAt = Number.NEGATIVE_INFINITY

  const attempt = async (windowId: number): Promise<string> => {
    const wait = lastAttemptAt + minIntervalMs - now()
    if (wait > 0) await sleep(wait)
    lastAttemptAt = now()
    return capture(windowId)
  }

  const run = async (windowId: number): Promise<string> => {
    for (let attemptNo = 1; ; attemptNo += 1) {
      try {
        return await attempt(windowId)
      } catch (error) {
        if (!isCaptureQuotaError(error) || attemptNo >= maxAttempts) throw error
        await sleep(retryDelayMs)
      }
    }
  }

  return {
    capture(windowId) {
      const next = tail.then(
        () => run(windowId),
        () => run(windowId),
      )
      tail = next.catch(() => {})
      return next
    },
  }
}

const queue = createCaptureQueue()

export class CaptureRefusedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'CaptureRefusedError'
  }
}

/**
 * Captures the tab the message came from. `captureVisibleTab` photographs whatever tab is active
 * in the window, so the sender must still be that tab: the user may have switched tabs during
 * the countdown, and a snapshot of someone else's tab is refused rather than taken.
 */
export async function captureSenderTab(
  sender: Pick<chrome.runtime.MessageSender, 'tab'>,
  captureQueue: CaptureQueue = queue,
): Promise<string> {
  const tabId = sender.tab?.id
  const windowId = sender.tab?.windowId
  if (tabId === undefined || windowId === undefined) {
    throw new CaptureRefusedError('capture/visible must come from a tab')
  }
  const tab = await getTab(tabId)
  if (!tab?.active || tab.windowId !== windowId) {
    throw new CaptureRefusedError('the tab is not the active tab of its window')
  }
  return captureQueue.capture(windowId)
}
