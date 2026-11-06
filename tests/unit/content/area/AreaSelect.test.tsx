// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { installChromeMock } from '@tests/mocks/chrome'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createOverlayHost, type OverlayHost } from '@/content/host'
import { App } from '@/content/overlay/App'
import { useOverlayStore } from '@/content/store/overlay'
import { trustSyntheticEventsForTests } from '@/shared/trustedEvents'

const css = ':host{all:initial}'

/** Runs a queued animation frame (stubbed to a macrotask) and lets React commit. */
async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1))
  })
}

describe('area select', () => {
  let host: OverlayHost
  let onExit: Mock<() => void>
  let button: HTMLButtonElement

  const q = (id: string) => host.shadowRoot.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const state = () => useOverlayStore.getState()
  const press = (key: string, code?: string) =>
    fireEvent.keyDown(document.body, { key, code: code ?? key })
  const down = (x: number, y: number, init: object = {}) =>
    fireEvent.pointerDown(document.body, { clientX: x, clientY: y, button: 0, ...init })
  /** A move with the primary button held, as during a real drag. */
  const move = (x: number, y: number, init: object = {}) =>
    fireEvent.pointerMove(document.body, { clientX: x, clientY: y, buttons: 1, ...init })
  const up = (x: number, y: number, init: object = {}) =>
    fireEvent.pointerUp(document.body, { clientX: x, clientY: y, button: 0, ...init })
  const activate = () => {
    press('a', 'KeyA')
    expect(state().tool).toBe('area')
  }
  /** Draws 100,200 → 400,350 and releases: a 300 × 150 area in `adjusting`. */
  const draw = async () => {
    down(100, 200)
    move(400, 350)
    await nextFrame()
    up(400, 350)
    expect(state().areaMode).toBe('adjusting')
  }
  const box = (id: string) => {
    const element = q(id) as HTMLElement
    return [element.style.left, element.style.top, element.style.width, element.style.height]
  }

  beforeEach(() => {
    installChromeMock()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {})
    window.innerWidth = 1280
    window.innerHeight = 720
    useOverlayStore.setState({
      tool: 'none',
      pickerMode: 'picking',
      areaMode: 'drawing',
      session: null,
    })
    document.body.innerHTML = `
      <main><p>Some text on the page</p><button type="button">Click</button></main>`
    button = document.querySelector('button') as HTMLButtonElement
    document.elementsFromPoint = vi.fn(() => [button, document.body])
    host = createOverlayHost(css)
    onExit = vi.fn<() => void>()
    render(<App host={host} language="en" onExit={onExit} />, { container: host.app })
  })

  afterEach(() => {
    cleanup()
    host.destroy()
    document.body.innerHTML = ''
  })

  it('A and the toolbar button toggle the tool; P and A switch each other', () => {
    activate()
    expect(q('toolbar-area')).toHaveAttribute('aria-pressed', 'true')
    expect(q('area-dim')).not.toBeNull()
    expect(q('overlay-hint')).toHaveTextContent(
      /^Drag to select\s*·\s*Shift\s*square\s*·\s*Alt\s*from center\s*·\s*corners to adjust\s*·\s*Esc\s*turn off area$/,
    )

    press('p', 'KeyP')
    expect(state().tool).toBe('picker')
    expect(q('area-dim')).toBeNull()
    expect(q('toolbar-area')).toHaveAttribute('aria-pressed', 'false')
    expect(q('toolbar-picker')).toHaveAttribute('aria-pressed', 'true')

    press('a', 'KeyA')
    expect(state().tool).toBe('area')
    expect(q('toolbar-picker')).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(q('toolbar-area') as HTMLElement)
    expect(state().tool).toBe('none')
    expect(q('area-dim')).toBeNull()
  })

  it('a drag draws the rectangle with a live chip; releasing shows handles and actions', async () => {
    activate()
    down(100, 200)
    expect(state().areaMode).toBe('dragging')
    move(250, 260)
    move(400, 350)
    await nextFrame()
    expect(box('area-selection')).toEqual(['100px', '200px', '300px', '150px'])
    expect(q('area-chip')).toHaveTextContent('300 × 150 · x 100 y 200')
    expect(q('area-dim')).toBeNull()
    expect(q('area-handle-se')).toBeNull()
    expect(q('area-actions')).toBeNull()
    expect(q('overlay-hint')).toHaveTextContent(/Esc\s*cancel$/)

    up(400, 350)
    expect(state().areaMode).toBe('adjusting')
    expect(box('area-selection')).toEqual(['100px', '200px', '300px', '150px'])
    expect((q('area-chip') as HTMLElement).style.top).toBe('170px')
    expect((q('area-handle-nw') as HTMLElement).style.left).toBe('95px')
    expect((q('area-handle-nw') as HTMLElement).style.top).toBe('195px')
    expect((q('area-handle-se') as HTMLElement).style.left).toBe('395px')
    expect((q('area-handle-se') as HTMLElement).style.top).toBe('345px')
    expect(q('area-actions')).not.toBeNull()
    expect(q('area-issue')).toBeEnabled()
    expect(q('area-issue')).toHaveTextContent(/Issue\s*Enter/)
    expect(q('area-reselect')).toHaveTextContent('Reselect')
    expect(q('overlay-hint')).toHaveTextContent(/Esc\s*cancel$/)
  })

  it('a click-sized drag is ignored', async () => {
    activate()
    down(100, 200)
    move(104, 207)
    await nextFrame()
    up(104, 207)
    expect(state().areaMode).toBe('drawing')
    expect(q('area-selection')).toBeNull()
    expect(q('area-dim')).not.toBeNull()
  })

  it('Shift and Alt shape the rectangle, also when pressed without moving the mouse', async () => {
    activate()
    down(300, 200)
    move(500, 250, { shiftKey: true })
    await nextFrame()
    expect(box('area-selection')).toEqual(['300px', '200px', '200px', '200px'])

    fireEvent.keyDown(document.body, { key: 'Alt', altKey: true, shiftKey: true })
    await nextFrame()
    expect(box('area-selection')).toEqual(['100px', '0px', '400px', '400px'])

    fireEvent.keyUp(document.body, { key: 'Shift', altKey: true, shiftKey: false })
    await nextFrame()
    expect(box('area-selection')).toEqual(['100px', '150px', '400px', '100px'])

    up(500, 250, { altKey: true })
    expect(state().areaMode).toBe('adjusting')
    expect(q('area-chip')).toHaveTextContent('400 × 100 · x 100 y 150')
  })

  it('handles resize the area, invert through the opposite corner and never go under 8 × 8', async () => {
    activate()
    await draw()

    const se = q('area-handle-se') as HTMLElement
    fireEvent.pointerDown(se, { clientX: 400, clientY: 350, button: 0, pointerId: 1 })
    move(500, 400)
    await nextFrame()
    expect(box('area-selection')).toEqual(['100px', '200px', '400px', '200px'])
    fireEvent.pointerUp(se, { clientX: 500, clientY: 400, button: 0, pointerId: 1 })
    expect(q('area-chip')).toHaveTextContent('400 × 200 · x 100 y 200')
    expect(state().areaMode).toBe('adjusting')

    // nw dragged past se: the rect flips and stays adjustable.
    const nw = q('area-handle-nw') as HTMLElement
    fireEvent.pointerDown(nw, { clientX: 100, clientY: 200, button: 0, pointerId: 1 })
    move(550, 430)
    await nextFrame()
    expect(box('area-selection')).toEqual(['500px', '400px', '50px', '30px'])
    fireEvent.pointerUp(nw, { clientX: 550, clientY: 430, button: 0, pointerId: 1 })
    expect(q('area-chip')).toHaveTextContent('50 × 30 · x 500 y 400')
    expect(q('area-handle-se')).not.toBeNull()

    // Released almost on the anchor: grown to the minimum instead of vanishing.
    const handle = q('area-handle-se') as HTMLElement
    fireEvent.pointerDown(handle, { clientX: 550, clientY: 430, button: 0, pointerId: 1 })
    move(502, 401)
    await nextFrame()
    fireEvent.pointerUp(handle, { clientX: 502, clientY: 401, button: 0, pointerId: 1 })
    expect(q('area-chip')).toHaveTextContent('8 × 8 · x 500 y 400')
  })

  it('Esc steps back: adjusting → drawing → tool off → exit; Reselect clears the area too', async () => {
    activate()
    await draw()

    press('Escape')
    expect(state().tool).toBe('area')
    expect(state().areaMode).toBe('drawing')
    expect(q('area-selection')).toBeNull()
    expect(q('area-dim')).not.toBeNull()

    await draw()
    fireEvent.click(q('area-reselect') as HTMLElement)
    expect(state().areaMode).toBe('drawing')
    expect(q('area-selection')).toBeNull()

    press('Escape')
    expect(state().tool).toBe('none')
    expect(q('area-dim')).toBeNull()
    expect(onExit).not.toHaveBeenCalled()
    press('Escape')
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('only the primary button ends a drag; a release outside the window is caught on the next move', async () => {
    activate()
    down(100, 200)
    move(400, 350)
    await nextFrame()
    // A right-button release mid-drag changes nothing.
    up(400, 350, { button: 2 })
    expect(state().areaMode).toBe('dragging')
    move(420, 360)
    await nextFrame()
    expect(box('area-selection')).toEqual(['100px', '200px', '320px', '160px'])

    // The button went up where no pointerup reached us: the next move with no button ends it.
    move(430, 365, { buttons: 0 })
    expect(state().areaMode).toBe('adjusting')
    expect(q('area-chip')).toHaveTextContent('330 × 165 · x 100 y 200')
  })

  it('keeps a bare Alt from reaching the browser while dragging', async () => {
    activate()
    down(100, 200)
    move(300, 300)
    await nextFrame()
    const altDown = new KeyboardEvent('keydown', {
      key: 'Alt',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      document.body.dispatchEvent(altDown)
    })
    expect(altDown.defaultPrevented).toBe(true)
    await nextFrame()
    // From the center, kept symmetric at the left edge: 100 px of room on each side.
    expect(box('area-selection')).toEqual(['0px', '100px', '200px', '200px'])
  })

  it('Esc during a drag cancels only the drag', async () => {
    activate()
    down(100, 200)
    move(400, 350)
    await nextFrame()
    press('Escape')
    expect(state().tool).toBe('area')
    expect(state().areaMode).toBe('drawing')
    expect(q('area-selection')).toBeNull()
    up(400, 350)
    expect(state().areaMode).toBe('drawing')
    expect(q('area-selection')).toBeNull()
  })

  it('the area stays in the viewport when the window shrinks', async () => {
    activate()
    await draw()
    window.innerWidth = 300
    window.innerHeight = 300
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(box('area-selection')).toEqual(['0px', '150px', '300px', '150px'])
  })

  it('blocks page clicks and selection only while the tool is active', () => {
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)

    activate()
    const pointerDownAllowed = fireEvent.pointerDown(button, {
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    expect(pointerDownAllowed).toBe(false)
    up(10, 10)
    fireEvent.click(button, { detail: 1 })
    expect(onClick).toHaveBeenCalledTimes(1)

    press('a', 'KeyA')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('ignores synthetic pointer input from the page', () => {
    activate()
    trustSyntheticEventsForTests(false)
    down(100, 200)
    expect(state().areaMode).toBe('drawing')
    expect(q('area-selection')).toBeNull()
  })
})
