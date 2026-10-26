import { normalizePath } from '@/shared/sessionKey'
import { LOCATION_CHANGE_EVENT } from '@/shared/spaPatch'

export interface LocationChange {
  pathname: string
  url: string
}

/**
 * Reports changes of the normalized `pathname` without a page load: SPA routers call
 * `pushState` / `replaceState` (surfaced by the main-world patch as `LOCATION_CHANGE_EVENT`),
 * the user presses Back / Forward (`popstate`). Query and hash changes are ignored — they do not
 * change the page a session or an issue belongs to. Returns the unwatch function.
 */
export function watchLocation(
  onChange: (change: LocationChange) => void,
  win: Window = window,
): () => void {
  let last = normalizePath(win.location.pathname)

  const check = () => {
    const pathname = normalizePath(win.location.pathname)
    if (pathname === last) return
    last = pathname
    onChange({ pathname, url: win.location.href })
  }

  win.addEventListener(LOCATION_CHANGE_EVENT, check)
  win.addEventListener('popstate', check)
  return () => {
    win.removeEventListener(LOCATION_CHANGE_EVENT, check)
    win.removeEventListener('popstate', check)
  }
}
