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

/** Opens a page in a new tab. Needed for `chrome://` URLs, which a plain link may not open. */
export async function createTab(url: string): Promise<void> {
  await requireChrome('tabs').tabs.create({ url })
}
