import { isTrustedEvent } from '@/shared/trustedEvents'

/**
 * Pointer events that would reach the page's own handlers or default actions: link navigation,
 * buttons, focus changes, text selection, context menus, middle-click tabs, drags.
 */
export const BLOCKED_PAGE_EVENTS = [
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'dragstart',
] as const

export interface PageEventBlockerOptions {
  /** Our overlay host: events on our own UI pass through untouched. */
  host: Element
  /** A user pointer click on the page that was swallowed — the picker locks the node under it. */
  onClick?: (event: MouseEvent) => void
  target?: Window
}

/**
 * While the picker is active a click on the page must not run the page (spec F3.3). Listeners
 * sit on `window` in the capture phase and stop the event before any page listener sees it.
 * `preventDefault` on `pointerdown` also suppresses focus changes and text selection; `click` is
 * still dispatched by the browser, which is where the picker reads the position from.
 *
 * Only user-generated events are touched: a site dispatching synthetic events to itself is the
 * site's business, and the picker never reacts to them either. Returns the uninstall function.
 */
export function blockPageEvents({
  host,
  onClick,
  target = window,
}: PageEventBlockerOptions): () => void {
  const handler = (event: Event) => {
    if (!isTrustedEvent(event)) return
    if (event.composedPath().includes(host)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    // `detail` is the click count: 0 means Enter / Space on a focused control, which carries no
    // position — there is nothing under (0, 0) worth locking.
    if (event.type === 'click' && (event as MouseEvent).detail > 0) onClick?.(event as MouseEvent)
  }

  for (const type of BLOCKED_PAGE_EVENTS) target.addEventListener(type, handler, true)
  return () => {
    for (const type of BLOCKED_PAGE_EVENTS) target.removeEventListener(type, handler, true)
  }
}
