import { normalizePath } from '@/shared/sessionKey'

export interface LocationChange {
  pathname: string
  url: string
}

export type LocationWatchStrategy = 'navigation-api' | 'polling'

/**
 * The Navigation API (Chrome 102+) is not in TypeScript's `lib.dom` yet; we only need the event
 * target. The event is dispatched on the shared C++ object, so an isolated-world listener (ours)
 * sees the page's own `pushState` / `replaceState` calls without touching the page's `history`.
 */
interface WithNavigation {
  navigation?: EventTarget
}

export const LOCATION_POLL_INTERVAL_MS = 500

function navigationOf(win: Window): EventTarget | undefined {
  return (win as Window & WithNavigation).navigation
}

export function locationWatchStrategy(win: Window = window): LocationWatchStrategy {
  return navigationOf(win) ? 'navigation-api' : 'polling'
}

/**
 * Reports changes of the normalized `pathname` without a page load: SPA routers calling
 * `pushState` / `replaceState`, the user pressing Back / Forward. Query and hash changes are
 * ignored — they do not change the page a session or an issue belongs to.
 *
 * Preferred source is `navigation.currententrychange`, which covers every same-document
 * navigation. Without the Navigation API (older Chrome, jsdom) we fall back to `popstate` plus
 * comparing `location.pathname` every 500 ms — `pushState` fires no event at all, and patching
 * `history` from the isolated world would never see the page's calls. Returns the unwatch function.
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

  const navigation = navigationOf(win)
  if (navigation) {
    navigation.addEventListener('currententrychange', check)
    return () => navigation.removeEventListener('currententrychange', check)
  }

  win.addEventListener('popstate', check)
  const timer = win.setInterval(check, LOCATION_POLL_INTERVAL_MS)
  return () => {
    win.removeEventListener('popstate', check)
    win.clearInterval(timer)
  }
}
