// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { lockScroll } from '@/content/snapshot/scrollLock'

function dispatch(target: EventTarget, event: Event): boolean {
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('lockScroll', () => {
  let unlock: (() => void) | undefined

  afterEach(() => {
    unlock?.()
    document.body.innerHTML = ''
  })

  it('cancels wheel and touch panning on the page, and releases them on unlock', () => {
    const host = document.createElement('dr-overlay')
    document.documentElement.append(host)
    unlock = lockScroll(host)

    const wheel = () => new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 })
    const touch = () => new Event('touchmove', { bubbles: true, cancelable: true })
    expect(dispatch(document.body, wheel())).toBe(true)
    expect(dispatch(document.body, touch())).toBe(true)
    // Our own UI keeps scrolling (a long panel, a menu).
    expect(dispatch(host, wheel())).toBe(false)

    unlock()
    unlock = undefined
    expect(dispatch(document.body, wheel())).toBe(false)
    host.remove()
  })

  it('cancels the scrolling keys except in text fields, with modifiers or over our UI', () => {
    document.body.innerHTML = '<input id="field" /><div contenteditable="true" id="rich"></div>'
    const host = document.createElement('dr-overlay')
    document.documentElement.append(host)
    unlock = lockScroll(host)

    const key = (init: KeyboardEventInit) =>
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init })
    for (const name of [' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowRight']) {
      expect(dispatch(document.body, key({ key: name })), name).toBe(true)
    }
    expect(dispatch(document.body, key({ key: 'a' }))).toBe(false)
    expect(dispatch(document.body, key({ key: 'ArrowDown', ctrlKey: true }))).toBe(false)
    expect(dispatch(document.body, key({ key: 'ArrowDown', metaKey: true }))).toBe(false)
    expect(dispatch(document.getElementById('field') as Element, key({ key: 'ArrowLeft' }))).toBe(
      false,
    )
    expect(dispatch(document.getElementById('rich') as Element, key({ key: ' ' }))).toBe(false)
    expect(dispatch(host, key({ key: ' ' }))).toBe(false)
    host.remove()
  })
})
