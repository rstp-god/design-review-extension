/**
 * Event our overlay listens to for in-page navigation. Dispatched on `window` by
 * `patchHistoryInPage`, which runs in the page's main world: a content script lives in an
 * isolated world with its own `History.prototype`, so patching `pushState` there would never see
 * the page's own calls.
 */
export const LOCATION_CHANGE_EVENT = 'dr:locationchange'

const PATCHED_FLAG = '__drHistoryPatched'

/**
 * Injected with `chrome.scripting.executeScript({ world: 'MAIN', func })`. The function is
 * serialized, so it must stay self-contained: no imports, no closures (the event name is a
 * literal on purpose — a unit test keeps it equal to `LOCATION_CHANGE_EVENT`). It only notifies;
 * it never reads or changes navigation.
 */
export function patchHistoryInPage(): void {
  const scope = window as Window & { __drHistoryPatched?: boolean }
  if (scope.__drHistoryPatched) return
  scope.__drHistoryPatched = true

  const notify = () => {
    window.dispatchEvent(new Event('dr:locationchange'))
  }

  const wrap = (method: 'pushState' | 'replaceState') => {
    const original = history[method]
    history[method] = function patched(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args)
      notify()
      return result
    }
  }

  wrap('pushState')
  wrap('replaceState')
}

export function isHistoryPatched(scope: Window = window): boolean {
  return Boolean((scope as Window & Record<string, unknown>)[PATCHED_FLAG])
}
