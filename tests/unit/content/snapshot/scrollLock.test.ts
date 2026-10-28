// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { lockScroll, SCROLLABLE_ATTRIBUTE } from '@/content/snapshot/scrollLock'

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

  it('cancels wheel and touch panning everywhere but a scrollable region of ours; unlock releases', () => {
    const host = document.createElement('dr-overlay')
    const shadow = host.attachShadow({ mode: 'open' })
    const layer = document.createElement('div')
    const panel = document.createElement('div')
    panel.setAttribute(SCROLLABLE_ATTRIBUTE, '')
    const inPanel = document.createElement('p')
    panel.append(inPanel)
    shadow.append(layer, panel)
    document.documentElement.append(host)
    unlock = lockScroll(host)

    const wheel = () =>
      new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, deltaY: 100 })
    const touch = () => new Event('touchmove', { bubbles: true, cancelable: true, composed: true })
    expect(dispatch(document.body, wheel())).toBe(true)
    expect(dispatch(document.body, touch())).toBe(true)
    // The snapshot layer is ours too: a wheel over it would scroll the page under the picture.
    expect(dispatch(layer, wheel())).toBe(true)
    // A long panel of ours keeps scrolling.
    expect(dispatch(inPanel, wheel())).toBe(false)
    // The page setting the same attribute on itself buys nothing.
    document.body.setAttribute(SCROLLABLE_ATTRIBUTE, '')
    expect(dispatch(document.body, wheel())).toBe(true)
    document.body.removeAttribute(SCROLLABLE_ATTRIBUTE)

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
