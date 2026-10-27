// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BLOCKED_PAGE_EVENTS, blockPageEvents } from '@/content/picker/blockPageEvents'
import { trustSyntheticEventsForTests } from '@/shared/trustedEvents'

function fire(target: EventTarget, type: string, init: MouseEventInit = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: 1,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

describe('blockPageEvents', () => {
  let uninstall: (() => void) | undefined
  const host = document.createElement('dr-overlay')
  const button = document.createElement('button')

  afterEach(() => {
    uninstall?.()
    uninstall = undefined
    host.remove()
    button.remove()
  })

  it('swallows user pointer events on the page before its listeners and reports clicks', () => {
    document.body.append(button, host)
    const onClick = vi.fn()
    const pageListener = vi.fn()
    button.addEventListener('click', pageListener)
    uninstall = blockPageEvents({ host, onClick })

    for (const type of BLOCKED_PAGE_EVENTS) {
      const event = fire(button, type, { clientX: 5, clientY: 6 })
      expect(event.defaultPrevented, type).toBe(true)
    }
    expect(pageListener).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({ clientX: 5, clientY: 6 })
  })

  it('reports swallowed pointerdowns for the area tool', () => {
    document.body.append(button, host)
    const onPointerDown = vi.fn()
    uninstall = blockPageEvents({ host, onPointerDown })

    fire(button, 'pointerdown', { clientX: 7, clientY: 8 })
    fire(button, 'mousedown', { clientX: 7, clientY: 8 })
    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(onPointerDown.mock.calls[0]?.[0]).toMatchObject({ clientX: 7, clientY: 8 })
  })

  it('swallows keyboard-activated clicks without reporting a position', () => {
    document.body.append(button, host)
    const onClick = vi.fn()
    const pageListener = vi.fn()
    button.addEventListener('click', pageListener)
    uninstall = blockPageEvents({ host, onClick })

    const event = fire(button, 'click', { detail: 0, clientX: 0, clientY: 0 })
    expect(event.defaultPrevented).toBe(true)
    expect(pageListener).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('leaves our own UI alone, even inside the shadow root', () => {
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const ours = document.createElement('button')
    shadow.append(ours)
    const ourListener = vi.fn()
    ours.addEventListener('click', ourListener)
    uninstall = blockPageEvents({ host })

    const event = fire(ours, 'click')
    expect(event.defaultPrevented).toBe(false)
    expect(ourListener).toHaveBeenCalledTimes(1)
  })

  it('ignores synthetic events the page dispatches to itself', () => {
    document.body.append(button, host)
    trustSyntheticEventsForTests(false)
    const pageListener = vi.fn()
    const onClick = vi.fn()
    button.addEventListener('click', pageListener)
    uninstall = blockPageEvents({ host, onClick })

    const event = fire(button, 'click')
    expect(event.defaultPrevented).toBe(false)
    expect(pageListener).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('uninstalls completely', () => {
    document.body.append(button, host)
    const pageListener = vi.fn()
    button.addEventListener('click', pageListener)
    blockPageEvents({ host })()

    const event = fire(button, 'click')
    expect(event.defaultPrevented).toBe(false)
    expect(pageListener).toHaveBeenCalledTimes(1)
  })
})
