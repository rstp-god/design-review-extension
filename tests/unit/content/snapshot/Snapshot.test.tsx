// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ChromeMock, installChromeMock } from '@tests/mocks/chrome'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createOverlayHost, type OverlayHost } from '@/content/host'
import { App } from '@/content/overlay/App'
import { countdownCorner, secondsLeft } from '@/content/overlay/Countdown'
import { formatSnapshotTime } from '@/content/overlay/SnapshotBadge'
import { CAPTURING_ATTRIBUTE } from '@/content/snapshot/capture'
import { useOverlayStore } from '@/content/store/overlay'
import type { Rect } from '@/shared/model'
import { useSettingsStore } from '@/store/settings'

const css = ':host{all:initial}'
const PNG = 'data:image/png;base64,iVBORw0KGgo='

/** Runs queued animation frames (stubbed to macrotasks) and lets React commit. */
async function tick(ms = 1) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('page snapshot', () => {
  let mock: ChromeMock
  let host: OverlayHost
  let onExit: Mock<() => void>
  let button: HTMLButtonElement
  let link: HTMLAnchorElement
  let captureReply: () =>
    | { ok: true; data: { dataUrl: string } }
    | { ok: false; error: { code: string; message: string } }
  let captureRequests: number
  let bitmapClose: Mock<() => void>

  const q = (id: string) => host.shadowRoot.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const state = () => useOverlayStore.getState()
  const press = (key: string, code?: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(document.body, { key, code: code ?? key, ...init })
  const moveTo = (x: number, y: number) =>
    fireEvent.pointerMove(document.body, { clientX: x, clientY: y })

  /** `F` and the whole shutter: frames, message round trip, decode, render. */
  async function freeze() {
    press('f', 'KeyF')
    await waitFor(() => expect(state().snapshotPhase).toBe('snapshot'))
    await tick()
  }

  beforeEach(() => {
    mock = installChromeMock()
    captureRequests = 0
    captureReply = () => ({ ok: true, data: { dataUrl: PNG } })
    mock.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const { type } = message as { type: string }
      if (type !== 'capture/visible') return false
      captureRequests += 1
      sendResponse(captureReply())
      return true
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    bitmapClose = vi.fn<() => void>()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2560, height: 1440, close: bitmapClose })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    window.innerWidth = 1280
    window.innerHeight = 720
    setHidden(false)
    useOverlayStore.setState({
      tool: 'none',
      pickerMode: 'picking',
      areaMode: 'drawing',
      session: null,
      snapshotPhase: 'live',
      countdown: null,
      snapshotMeta: null,
      toast: null,
    })
    useSettingsStore.setState({
      tooltipFields: ['typography', 'colors', 'spacing', 'size'],
      colorFormat: 'hex',
      units: 'px',
      freezeDelay: 5,
    })

    document.body.innerHTML = `
      <main><article class="product-card">
        <a href="/cart/" class="link">Cart</a>
        <button type="button" class="card__cta">Add to cart</button>
      </article></main>`
    button = document.querySelector('button') as HTMLButtonElement
    link = document.querySelector('a') as HTMLAnchorElement
    button.style.cssText =
      'color: rgb(255, 255, 255); background-color: rgb(37, 99, 235); padding: 10px 16px; display: flex'
    const rects = new Map<Element, Rect>([
      [document.documentElement, { x: 0, y: 0, w: 1280, h: 720 }],
      [document.body, { x: 0, y: 0, w: 1280, h: 720 }],
      [document.querySelector('main') as Element, { x: 0, y: 0, w: 1280, h: 720 }],
      [document.querySelector('article') as Element, { x: 50, y: 150, w: 400, h: 200 }],
      [link, { x: 60, y: 160, w: 100, h: 20 }],
      [button, { x: 100, y: 200, w: 246, h: 40 }],
    ])
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const value = rects.get(this) ?? { x: 0, y: 0, w: 0, h: 0 }
      return {
        x: value.x,
        y: value.y,
        width: value.w,
        height: value.h,
        left: value.x,
        top: value.y,
        right: value.x + value.w,
        bottom: value.y + value.h,
        toJSON: () => value,
      } as DOMRect
    })
    // The live page: the button is under x < 150; a snapshot answers from its own rects.
    document.elementsFromPoint = vi.fn((x: number) => (x < 150 ? [button, document.body] : []))

    host = createOverlayHost(css)
    onExit = vi.fn<() => void>()
    render(<App host={host} language="en" onExit={onExit} />, { container: host.app })
  })

  afterEach(() => {
    cleanup()
    host.destroy()
    document.body.innerHTML = ''
    setHidden(false)
  })

  it('F asks the background for the capture and puts the picture over the page, out of its reach', async () => {
    const attachShadow = vi.spyOn(Element.prototype, 'attachShadow')
    await freeze()

    expect(captureRequests).toBe(1)
    expect(host.host.hasAttribute(CAPTURING_ATTRIBUTE)).toBe(false)
    const layer = q('snapshot-layer') as HTMLElement
    expect(layer).not.toBeNull()
    // The page shares our DOM: a canvas in the open root could be read with getImageData from
    // the page's world. It is inside a closed root instead, and nothing but the root created
    // here can reach it.
    expect(layer.shadowRoot).toBeNull()
    expect(layer.querySelector('canvas')).toBeNull()
    const closed = attachShadow.mock.results.find(
      (_result, index) => attachShadow.mock.calls[index]?.[0]?.mode === 'closed',
    )?.value as ShadowRoot
    expect(closed.host).toBe(layer)
    const canvas = closed.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(2560)
    expect(canvas.height).toBe(1440)
    expect(canvas.style.width).toBe('1280px')
    expect(canvas.style.height).toBe('720px')
    expect(state().snapshotMeta?.takenAt).toBeGreaterThan(0)

    press('f', 'KeyF')
    await tick()
    expect(closed.querySelector('canvas')).toBeNull()
  })

  it('keeps the tool, drops a locked node, and the picker reads the snapshot', async () => {
    press('p', 'KeyP')
    fireEvent.click(button, { clientX: 120, clientY: 210, detail: 1 })
    expect(state().pickerMode).toBe('locked')

    await freeze()
    expect(state().tool).toBe('picker')
    expect(state().pickerMode).toBe('picking')
    expect(q('picker-locked-frame')).toBeNull()

    // One shield over the whole viewport: clicks land on it, never on the page.
    const shield = q('picker-shield-0') as HTMLElement
    expect(shield.style.width).toBe('1280px')
    expect(shield.style.height).toBe('720px')

    // Hover answers from the frozen rects — beyond x = 150 the live page had nothing.
    moveTo(300, 210)
    await tick()
    expect(q('picker-tooltip-tag')).toHaveTextContent('button.card__cta')
    expect(q('picker-tooltip-row-color')).toHaveTextContent('#FFFFFF')
    moveTo(80, 165)
    await tick()
    expect(q('picker-tooltip-tag')).toHaveTextContent('a.link')

    const onPage = vi.fn()
    button.addEventListener('click', onPage)
    fireEvent.click(shield, { clientX: 300, clientY: 210, detail: 1 })
    expect(state().pickerMode).toBe('locked')
    expect(q('picker-locked-chip')).toHaveTextContent('× 40')
    expect(onPage).not.toHaveBeenCalled()
  })

  it('F on the snapshot returns to the live page with the same tool; the bitmap is released', async () => {
    press('p', 'KeyP')
    await freeze()

    press('f', 'KeyF')
    await tick()
    expect(state().snapshotPhase).toBe('live')
    expect(q('snapshot-layer')).toBeNull()
    expect(state().tool).toBe('picker')
    expect(bitmapClose).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()

    moveTo(120, 210)
    await tick()
    expect(q('picker-tooltip-tag')).toHaveTextContent('button.card__cta')
  })

  it('Escape: tool off, then live page, then exit', async () => {
    press('p', 'KeyP')
    await freeze()

    press('Escape')
    expect(state().tool).toBe('none')
    expect(state().snapshotPhase).toBe('snapshot')
    press('Escape')
    await tick()
    expect(state().snapshotPhase).toBe('live')
    expect(onExit).not.toHaveBeenCalled()
    press('Escape')
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('blocks the wheel and the scrolling keys only while the snapshot is up', async () => {
    const wheel = () => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 50 })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    }
    const space = () => {
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(wheel()).toBe(false)
    await freeze()
    expect(wheel()).toBe(true)
    expect(space()).toBe(true)
    press('f', 'KeyF')
    await tick()
    expect(wheel()).toBe(false)
    expect(space()).toBe(false)
  })

  it('a resize or a zoom change closes the snapshot with a toast', async () => {
    await freeze()
    window.innerWidth = 1000
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await tick()
    expect(state().snapshotPhase).toBe('live')
    expect(q('snapshot-layer')).toBeNull()
    expect(q('overlay-toast')).toHaveTextContent('Window size changed — snapshot closed')

    act(() => {
      state().dismissToast(state().toast?.id ?? 0)
    })
    expect(q('overlay-toast')).toBeNull()
  })

  it('a refused capture shows a toast and stays live', async () => {
    captureReply = () => ({
      ok: false,
      error: { code: 'handler-failed', message: 'the tab is not the active tab of its window' },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    press('f', 'KeyF')
    await waitFor(() => expect(q('overlay-toast')).not.toBeNull())
    expect(q('overlay-toast')).toHaveTextContent('Could not take the snapshot')
    expect(state().snapshotPhase).toBe('live')
    expect(q('snapshot-layer')).toBeNull()
    expect(host.host.hasAttribute(CAPTURING_ATTRIBUTE)).toBe(false)
    warn.mockRestore()
  })

  it('a hidden tab gets no capture request at all', async () => {
    setHidden(true)
    press('f', 'KeyF')
    await waitFor(() => expect(q('overlay-toast')).not.toBeNull())
    expect(q('overlay-toast')).toHaveTextContent('The tab was not visible')
    expect(captureRequests).toBe(0)
    expect(state().snapshotPhase).toBe('live')
  })

  it('Shift+F starts the countdown from the settings, restarts it, Esc cancels, F fires at once', async () => {
    press('F', 'KeyF', { shiftKey: true })
    expect(state().snapshotPhase).toBe('countdown')
    const first = state().countdown
    expect(first?.total).toBe(5)
    expect((first?.endsAt ?? 0) - Date.now()).toBeGreaterThan(4_000)

    await tick(20)
    press('F', 'KeyF', { shiftKey: true })
    expect(state().countdown?.endsAt).toBeGreaterThan(first?.endsAt ?? 0)

    press('Escape')
    expect(state().snapshotPhase).toBe('live')
    expect(state().countdown).toBeNull()
    expect(onExit).not.toHaveBeenCalled()
    expect(captureRequests).toBe(0)

    press('F', 'KeyF', { shiftKey: true })
    press('f', 'KeyF')
    await waitFor(() => expect(state().snapshotPhase).toBe('snapshot'))
    expect(captureRequests).toBe(1)
  })

  it('the countdown fires the shutter when it ends, and a hidden tab cancels it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      useSettingsStore.setState({ freezeDelay: 3 })
      press('F', 'KeyF', { shiftKey: true })
      expect(state().countdown?.total).toBe(3)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_100)
      })
      await waitFor(() => expect(state().snapshotPhase).toBe('snapshot'))
      expect(captureRequests).toBe(1)
    } finally {
      vi.useRealTimers()
    }

    press('f', 'KeyF')
    await tick()
    press('F', 'KeyF', { shiftKey: true })
    expect(state().snapshotPhase).toBe('countdown')
    setHidden(true)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(state().snapshotPhase).toBe('live')
    expect(q('overlay-toast')).toHaveTextContent('The tab was not visible')
    expect(captureRequests).toBe(1)
  })

  it('Shift+F on a snapshot leaves it and starts a new countdown', async () => {
    await freeze()
    press('F', 'KeyF', { shiftKey: true })
    expect(state().snapshotPhase).toBe('countdown')
    expect(q('snapshot-layer')).toBeNull()
    press('Escape')
    expect(state().snapshotPhase).toBe('live')
  })

  it('Shift+F from a locked snapshot drops the lock before the live source is back', async () => {
    press('p', 'KeyP')
    await freeze()
    fireEvent.click(q('picker-shield-0') as HTMLElement, { clientX: 300, clientY: 210, detail: 1 })
    expect(state().pickerMode).toBe('locked')

    press('F', 'KeyF', { shiftKey: true })
    await tick()
    expect(state().snapshotPhase).toBe('countdown')
    expect(state().tool).toBe('picker')
    expect(state().pickerMode).toBe('picking')
    expect(q('picker-locked-chip')).toBeNull()
    // The live source answers the arrows and the hover again without a snapshot node in hand.
    press('ArrowUp')
    moveTo(120, 210)
    await tick()
    expect(q('picker-tooltip-tag')).toHaveTextContent('button.card__cta')
    press('Escape')
    expect(state().snapshotPhase).toBe('live')
  })

  it('a capture that finishes after the review ended releases its bitmap', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mock.runtime.onMessage.listeners.clear()
    mock.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if ((message as { type: string }).type !== 'capture/visible') return false
      void gate.then(() => sendResponse({ ok: true, data: { dataUrl: PNG } }))
      return true
    })
    press('f', 'KeyF')
    await waitFor(() => expect(state().snapshotPhase).toBe('capturing'))
    cleanup()
    release?.()
    await waitFor(() => expect(bitmapClose).toHaveBeenCalledTimes(1))
    expect(q('snapshot-layer')).toBeNull()
    expect(state().snapshotMeta).toBeNull()
  })

  it('the toolbar menu offers Now and the delays live, the way back and a retake on a snapshot', async () => {
    const user = userEvent.setup()
    const freeze = q('toolbar-freeze') as HTMLElement
    expect(freeze).toHaveAttribute('aria-pressed', 'false')
    await user.click(freeze)
    let menu = await waitFor(() => host.shadowRoot.querySelector('[role="menu"]') as HTMLElement)
    expect(menu).toHaveTextContent('Now')
    expect(menu).toHaveTextContent('In 3 s')
    expect(menu).toHaveTextContent('In 5 s')
    expect(menu).toHaveTextContent('In 10 s')
    expect(menu).toHaveTextContent('hover states, dropdowns and animations stay put')
    const five = q('ui-menu-item-freeze-5') as HTMLElement
    expect(Array.from(five.querySelectorAll('kbd')).map((k) => k.textContent)).toEqual([
      'Shift',
      'F',
    ])
    expect(q('ui-menu-item-freeze-3')?.querySelector('kbd')).toBeNull()

    await user.click(q('ui-menu-item-freeze-3') as HTMLElement)
    expect(state().snapshotPhase).toBe('countdown')
    expect(state().countdown?.total).toBe(3)
    press('Escape')

    await user.click(freeze)
    await waitFor(() => expect(q('ui-menu-item-freeze-now')).not.toBeNull())
    await user.click(q('ui-menu-item-freeze-now') as HTMLElement)
    await waitFor(() => expect(state().snapshotPhase).toBe('snapshot'))
    await tick()
    expect(freeze).toHaveAttribute('aria-pressed', 'true')
    expect(freeze).toHaveAttribute('data-active', 'true')
    const badge = q('snapshot-badge') as HTMLElement
    expect(badge).toHaveAttribute('role', 'status')
    expect(badge).toHaveTextContent(/^Snapshot \d{2}:\d{2}:\d{2}\s*·\s*F\s*live page$/)
    expect(q('overlay-hint')).toHaveTextContent(
      /^P\s*picker\s*·\s*A\s*area\s*·\s*F\s*live page\s*·\s*Esc\s*live page$/,
    )

    await user.click(freeze)
    menu = await waitFor(() => host.shadowRoot.querySelector('[role="menu"]') as HTMLElement)
    expect(menu).toHaveTextContent('Live page')
    expect(menu).toHaveTextContent('New snapshot in 5 s')
    expect(menu).not.toHaveTextContent('stay put')
    await user.click(q('ui-menu-item-freeze-live') as HTMLElement)
    await tick()
    expect(state().snapshotPhase).toBe('live')
    expect(q('snapshot-badge')).toBeNull()
    expect(freeze).toHaveAttribute('aria-pressed', 'false')
  })

  it('formats the badge time as a 24-hour clock with seconds', () => {
    const noon = new Date(2026, 0, 15, 14, 20, 31).getTime()
    expect(formatSnapshotTime(noon, 'en-US')).toBe('14:20:31')
    expect(formatSnapshotTime(noon, 'ru-RU')).toBe('14:20:31')
    expect(formatSnapshotTime(new Date(2026, 0, 15, 0, 5, 9).getTime(), 'en-US')).toBe('00:05:09')
  })

  it('ignores a second F while the capture is in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mock.runtime.onMessage.listeners.clear()
    mock.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if ((message as { type: string }).type !== 'capture/visible') return false
      captureRequests += 1
      void gate.then(() => sendResponse({ ok: true, data: { dataUrl: PNG } }))
      return true
    })
    press('f', 'KeyF')
    await waitFor(() => expect(state().snapshotPhase).toBe('capturing'))
    press('f', 'KeyF')
    press('Escape')
    expect(onExit).not.toHaveBeenCalled()
    release?.()
    await waitFor(() => expect(state().snapshotPhase).toBe('snapshot'))
    expect(captureRequests).toBe(1)
  })
})

describe('countdown pill', () => {
  let host: OverlayHost

  const q = (id: string) => host.shadowRoot.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const state = () => useOverlayStore.getState()
  const ring = () =>
    (q('countdown') as HTMLElement).querySelector('circle.stroke-accent') as SVGCircleElement
  const offset = () => Number.parseFloat(ring().getAttribute('stroke-dashoffset') ?? '')

  beforeEach(() => {
    installChromeMock()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    window.innerWidth = 1280
    window.innerHeight = 720
    useOverlayStore.setState({
      tool: 'none',
      position: null,
      snapshotPhase: 'live',
      countdown: null,
      snapshotMeta: null,
      toast: null,
    })
    useSettingsStore.setState({ freezeDelay: 5 })
    host = createOverlayHost(css)
    render(<App host={host} language="en" onExit={vi.fn()} />, { container: host.app })
  })

  afterEach(() => {
    cleanup()
    host.destroy()
  })

  it('shows the seconds, a full ring, the texts and Cancel without taking the focus', () => {
    const focused = document.activeElement
    act(() => {
      state().startCountdown(5)
    })
    const pill = q('countdown') as HTMLElement
    expect(pill).toHaveAttribute('role', 'status')
    expect(pill).toHaveAttribute('data-corner', 'bottom-right')
    expect(q('countdown-seconds')).toHaveTextContent('5')
    expect(pill).toHaveTextContent('Snapshot in 5 s')
    expect(pill).toHaveTextContent('Hover the state you need')
    expect(q('countdown-cancel')).toHaveTextContent('Cancel')
    expect(document.activeElement).toBe(focused)
    expect(offset()).toBeCloseTo(0, 5)
    // Only the button takes the pointer.
    expect((pill.parentElement as HTMLElement).className).toContain('pointer-events-none')
    expect((q('countdown-cancel') as HTMLElement).className).toContain('pointer-events-auto')
  })

  it('moves to the opposite corner when the toolbar sits bottom-right', () => {
    act(() => {
      useOverlayStore.setState({ position: { x: 900, y: 600 } })
      state().startCountdown(3)
    })
    expect(q('countdown')).toHaveAttribute('data-corner', 'top-left')
    expect(countdownCorner(null, { w: 1280, h: 720 })).toBe('bottom-right')
    expect(countdownCorner({ x: 16, y: 600 }, { w: 1280, h: 720 })).toBe('bottom-right')
    expect(countdownCorner({ x: 900, y: 100 }, { w: 1280, h: 720 })).toBe('bottom-right')
    expect(countdownCorner({ x: 900, y: 600 }, { w: 1280, h: 720 })).toBe('top-left')
  })

  it('counts down by the second and empties the ring; Cancel ends it', async () => {
    vi.useFakeTimers()
    try {
      act(() => {
        state().startCountdown(3)
      })
      expect(q('countdown-seconds')).toHaveTextContent('3')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_050)
      })
      expect(q('countdown-seconds')).toHaveTextContent('2')
      expect(offset()).toBeGreaterThan(0)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(q('countdown-seconds')).toHaveTextContent('1')
      expect(secondsLeft(10_000, 9_001)).toBe(1)
      expect(secondsLeft(10_000, 10_000)).toBe(0)
      expect(secondsLeft(10_000, 12_000)).toBe(0)

      fireEvent.click(q('countdown-cancel') as HTMLElement)
      expect(state().snapshotPhase).toBe('live')
      expect(q('countdown')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
