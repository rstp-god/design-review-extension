/**
 * The host page shares the DOM with our overlay: it can dispatch `keydown` on `window` or call
 * `.click()` on a button inside our open shadow root. Everything that changes review state
 * (exit, collapse, drag, hotkeys) therefore accepts user-generated events only.
 *
 * jsdom cannot produce trusted events, so unit tests opt in to synthetic ones through
 * `trustSyntheticEventsForTests`; production code never calls it.
 */
let trustSynthetic = false

export function isTrustedEvent(event: { isTrusted: boolean }): boolean {
  return event.isTrusted || trustSynthetic
}

/** Unit tests only. */
export function trustSyntheticEventsForTests(enabled: boolean): void {
  trustSynthetic = enabled
}

/** Wraps a handler so the page's synthetic events (`.click()`, `dispatchEvent`) never reach it. */
export function onlyTrusted<E extends { isTrusted: boolean }>(
  handler?: (event: E) => void,
): (event: E) => void {
  return (event) => {
    if (handler && isTrustedEvent(event)) handler(event)
  }
}
