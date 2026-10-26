// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installHotkeys, isEditableTarget } from '@/content/hotkeys'
import { trustSyntheticEventsForTests } from '@/shared/trustedEvents'

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

describe('hotkeys', () => {
  let uninstall: (() => void) | undefined

  afterEach(() => {
    uninstall?.()
    document.body.innerHTML = ''
  })

  it('fires the matching binding, prevents default and stops the page from seeing it', () => {
    const onEscape = vi.fn()
    const onPicker = vi.fn()
    const pageListener = vi.fn()
    uninstall = installHotkeys([
      { key: 'Escape', handler: onEscape },
      { key: 'p', code: 'KeyP', handler: onPicker },
    ])
    window.addEventListener('keydown', pageListener)

    const escapeEvent = press(document.body, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(escapeEvent.defaultPrevented).toBe(true)

    press(document.body, { key: 'P', code: 'KeyP' })
    press(document.body, { key: 'з', code: 'KeyP' })
    expect(onPicker).toHaveBeenCalledTimes(2)

    press(document.body, { key: 'x', code: 'KeyX' })
    expect(pageListener).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', pageListener)
  })

  it('distinguishes Shift and ignores Ctrl / Alt / Meta combinations', () => {
    const now = vi.fn()
    const delayed = vi.fn()
    uninstall = installHotkeys([
      { key: 'f', code: 'KeyF', handler: now },
      { key: 'f', code: 'KeyF', shift: true, handler: delayed },
    ])

    press(document.body, { key: 'f', code: 'KeyF' })
    press(document.body, { key: 'F', code: 'KeyF', shiftKey: true })
    press(document.body, { key: 'f', code: 'KeyF', ctrlKey: true })
    press(document.body, { key: 'f', code: 'KeyF', metaKey: true })

    expect(now).toHaveBeenCalledTimes(1)
    expect(delayed).toHaveBeenCalledTimes(1)
  })

  it('lets single keys through while typing, but still handles Escape', () => {
    const onEscape = vi.fn()
    const onPicker = vi.fn()
    uninstall = installHotkeys([
      { key: 'Escape', handler: onEscape },
      { key: 'p', code: 'KeyP', handler: onPicker },
    ])
    const input = document.createElement('input')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.append(input, editable)

    const typed = press(input, { key: 'p', code: 'KeyP' })
    expect(onPicker).not.toHaveBeenCalled()
    expect(typed.defaultPrevented).toBe(false)

    press(editable, { key: 'p', code: 'KeyP' })
    expect(onPicker).not.toHaveBeenCalled()

    press(input, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('finds the real target behind an open shadow root', () => {
    const onPicker = vi.fn()
    uninstall = installHotkeys([{ key: 'p', code: 'KeyP', handler: onPicker }])
    const host = document.createElement('div')
    const input = document.createElement('textarea')
    host.attachShadow({ mode: 'open' }).append(input)
    document.body.append(host)

    press(input, { key: 'p', code: 'KeyP' })
    expect(onPicker).not.toHaveBeenCalled()
  })

  it('ignores synthetic events the page dispatches', () => {
    const handler = vi.fn()
    uninstall = installHotkeys([{ key: 'Escape', handler }])
    trustSyntheticEventsForTests(false)
    const event = press(document.body, { key: 'Escape' })
    expect(handler).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('uninstalls cleanly', () => {
    const handler = vi.fn()
    installHotkeys([{ key: 'Escape', handler }])()
    press(document.body, { key: 'Escape' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('classifies editable targets', () => {
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
  })
})
