import { isTrustedEvent } from '@/shared/trustedEvents'

export interface HotkeyBinding {
  /** `event.key`, case-insensitive for single characters: `'p'`, `'Escape'`. */
  key: string
  /** `event.code` for layout-independent letters: `'KeyP'` fires on a Cyrillic layout too. */
  code?: string
  shift?: boolean
  /**
   * Leave the key to the page while the focus is in a text field (spec 3.11). Defaults to `true`
   * for single characters (`P` types a letter) and `false` for named keys (`Escape`).
   */
  ignoreInEditable?: boolean
  /** Skip this binding entirely while another UI mode owns keyboard input. */
  when?: () => boolean
  handler: (event: KeyboardEvent) => void
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Text fields of the host page (and ours): single-key hotkeys must not steal typing. */
export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false
  if (EDITABLE_TAGS.has(target.tagName)) return true
  if ((target as HTMLElement).isContentEditable === true) return true
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null
}

function keyOf(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key
}

function matches(binding: HotkeyBinding, event: KeyboardEvent): boolean {
  if (Boolean(binding.shift) !== event.shiftKey) return false
  if (binding.code && event.code === binding.code) return true
  const expected = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key
  return keyOf(event) === expected
}

/**
 * Review-mode hotkeys (spec 3.11). Listens on `window` in the capture phase so a page that
 * swallows keyboard events cannot hide ours, and stops propagation only for keys we handle.
 * Synthetic events dispatched by the page are ignored: a site must not be able to end the
 * review. Single-character keys are ignored while the focus is in an editable element;
 * `Escape` and Chrome's global command always work. Returns the uninstall function.
 */
export function installHotkeys(bindings: readonly HotkeyBinding[], target: Window = window) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isTrustedEvent(event)) return
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return

    const binding = bindings.find(
      (candidate) => matches(candidate, event) && (candidate.when?.() ?? true),
    )
    if (!binding) return

    const ignoreInEditable = binding.ignoreInEditable ?? binding.key.length === 1
    const realTarget = event.composedPath?.()[0] ?? event.target
    if (ignoreInEditable && isEditableTarget(realTarget)) return

    event.preventDefault()
    event.stopImmediatePropagation()
    binding.handler(event)
  }

  target.addEventListener('keydown', onKeyDown, true)
  return () => target.removeEventListener('keydown', onKeyDown, true)
}
