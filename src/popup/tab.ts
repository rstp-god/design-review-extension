import { getTab, queryActiveTab, type Tab } from '@/services/chrome/tabs'

/**
 * The tab the popup acts on. Normally the active tab of the current window; its `url` is readable
 * because opening the popup granted `activeTab`.
 *
 * In dev and E2E builds the popup is also opened as a regular tab, where "the active tab" is the
 * popup itself. `?tab=<id>` points it at another tab instead. The parameter is ignored in the
 * production build.
 */
export async function resolvePopupTab(search = window.location.search): Promise<Tab | null> {
  const allowOverride = import.meta.env.DEV || import.meta.env.VITE_E2E === '1'
  if (allowOverride) {
    const raw = new URLSearchParams(search).get('tab')
    const tabId = raw === null ? Number.NaN : Number.parseInt(raw, 10)
    if (Number.isInteger(tabId) && tabId >= 0) return getTab(tabId)
  }
  return queryActiveTab()
}
