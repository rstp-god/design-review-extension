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

/**
 * While a snapshot is up the page must not move under the picture (spec 3.5): the wheel, touch
 * panning and the scrolling keys are cancelled on `window` in the capture phase. Keys typed into
 * a text field and anything aimed at our own UI (`host`) stay untouched; the arrow keys of the
 * Locked state are ours anyway. Programmatic scrolls cannot be stopped — the picture stays, the
 * page is wherever it went once the snapshot ends. Returns the unlock function.
 */
export function lockScroll(host: Element, target: Window = window): () => void {
  const cancel = (event: Event) => {
    if (event.composedPath().includes(host)) return
    event.preventDefault()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (isEditableTarget(event.composedPath()[0] ?? event.target)) return
    cancel(event)
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
