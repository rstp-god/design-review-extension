/**
 * Calls `onChange` when the page scrolls (any scroller, capture phase) or the window resizes:
 * everything the picker draws is in viewport coordinates and must be re-measured then. Each
 * consumer keeps its own animation-frame throttle; this only owns the listeners. Returns the
 * unsubscribe function.
 */
export function onLayoutChange(onChange: () => void, target: Window = window): () => void {
  target.addEventListener('scroll', onChange, { capture: true, passive: true })
  target.addEventListener('resize', onChange)
  return () => {
    target.removeEventListener('scroll', onChange, { capture: true })
    target.removeEventListener('resize', onChange)
  }
}
