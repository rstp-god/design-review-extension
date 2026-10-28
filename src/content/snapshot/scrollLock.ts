import { isEditableTarget } from '@/content/hotkeys'

/** Keys that scroll the document when nothing focused takes them. */
const SCROLL_KEYS = new Set([
  ' ',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

/** A scrollable region of our own UI (a long panel) opts out of the wheel and touch lock. */
export const SCROLLABLE_ATTRIBUTE = 'data-dr-scrollable'

/** Only an attribute inside our shadow root counts: the page may write any attribute it likes. */
function insideScrollableUi(event: Event, host: Element): boolean {
  const path = event.composedPath()
  const hostIndex = path.indexOf(host)
  if (hostIndex === -1) return false
  return path
    .slice(0, hostIndex)
    .some((node) => node instanceof Element && node.hasAttribute(SCROLLABLE_ATTRIBUTE))
}

/**
 * While a snapshot is up the page must not move under the picture (spec 3.5): the wheel, touch
 * panning and the scrolling keys are cancelled on `window` in the capture phase. The wheel over
 * our own layer counts too — the snapshot layer is ours, and a wheel there would scroll the page
 * under it — unless it rolls inside a region marked `data-dr-scrollable`. Keys typed into a text
 * field and keys aimed at our own UI (`host`: Space on a button) stay untouched; the arrow keys of
 * the Locked state are ours anyway. Programmatic scrolls cannot be stopped — the picture stays,
 * the page is wherever it went once the snapshot ends. Returns the unlock function.
 */
export function lockScroll(host: Element, target: Window = window): () => void {
  const cancel = (event: Event) => {
    if (insideScrollableUi(event, host)) return
    event.preventDefault()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const path = event.composedPath()
    if (path.includes(host)) return
    if (isEditableTarget(path[0] ?? event.target)) return
    event.preventDefault()
  }

  target.addEventListener('wheel', cancel, { capture: true, passive: false })
  target.addEventListener('touchmove', cancel, { capture: true, passive: false })
  target.addEventListener('keydown', onKeyDown, true)
  return () => {
    target.removeEventListener('wheel', cancel, { capture: true })
    target.removeEventListener('touchmove', cancel, { capture: true })
    target.removeEventListener('keydown', onKeyDown, true)
  }
}
