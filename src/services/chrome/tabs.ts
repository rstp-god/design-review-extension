import { requireChrome } from './runtime'

export type Tab = chrome.tabs.Tab

/**
 * The tab the popup was opened on. `url` is present without the `tabs` permission because
 * opening the popup is the user gesture that grants `activeTab`.
 */
export async function queryActiveTab(): Promise<Tab | null> {
  const [tab] = await requireChrome('tabs').tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

/** Active tab of the last focused window — the service worker has no "current" window. */
export async function queryLastFocusedActiveTab(): Promise<Tab | null> {
  const [tab] = await requireChrome('tabs').tabs.query({ active: true, lastFocusedWindow: true })
  return tab ?? null
}

export async function getTab(tabId: number): Promise<Tab | null> {
  try {
    return await requireChrome('tabs').tabs.get(tabId)
  } catch {
    return null
  }
}

export async function findTabsByUrl(url: string): Promise<Tab[]> {
  return requireChrome('tabs').tabs.query({ url })
}

export async function sendTabMessage(tabId: number, message: unknown): Promise<unknown> {
  return requireChrome('tabs').tabs.sendMessage(tabId, message)
}

/**
 * PNG data URL of the visible area of the window's active tab. Covered by `activeTab` once the
 * user started a review there; no host permission is involved (E2E builds carry `<all_urls>`).
 */
export async function captureVisibleTab(windowId: number): Promise<string> {
  return requireChrome('tabs').tabs.captureVisibleTab(windowId, { format: 'png' })
}

/** Opens a page in a new tab. Needed for `chrome://` URLs, which a plain link may not open. */
export async function createTab(url: string): Promise<void> {
  await requireChrome('tabs').tabs.create({ url })
}
