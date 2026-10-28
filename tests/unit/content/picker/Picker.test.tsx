// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { installChromeMock } from '@tests/mocks/chrome'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createOverlayHost, type OverlayHost } from '@/content/host'
import { App } from '@/content/overlay/App'
import { useOverlayStore } from '@/content/store/overlay'
import { trustSyntheticEventsForTests } from '@/shared/trustedEvents'
import { useSettingsStore } from '@/store/settings'

const css = ':host{all:initial}'

/** Runs a queued animation frame (stubbed to a macrotask) and lets React commit. */
async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1))
  })
}

describe('picker', () => {
  let host: OverlayHost
  let onExit: Mock<() => void>
  let button: HTMLButtonElement
  let link: HTMLAnchorElement

  const q = (id: string) => host.shadowRoot.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const press = (key: string, code?: string) =>
    fireEvent.keyDown(document.body, { key, code: code ?? key })
  const moveTo = (x: number, y: number) =>
    fireEvent.pointerMove(document.body, { clientX: x, clientY: y })

  beforeEach(() => {
    installChromeMock()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    useOverlayStore.setState({ tool: 'none', pickerMode: 'picking', session: null })
    useSettingsStore.setState({
      tooltipFields: ['typography', 'colors', 'spacing', 'size'],
      colorFormat: 'hex',
      units: 'px',
    })

    document.body.innerHTML = `
      <main><article class="product-card">
        <a href="/cart/" class="link">Cart</a>
        <button type="button" class="card__cta">Add to cart</button>
      </article></main>`
    button = document.querySelector('button') as HTMLButtonElement
    link = document.querySelector('a') as HTMLAnchorElement
    button.style.cssText =
      'color: rgb(255, 255, 255); background-color: rgb(37, 99, 235); padding: 10px 16px; margin: 16px 0 0; font-size: 14px; display: flex'
    button.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 246, height: 40, right: 346, bottom: 240 }) as DOMRect
    document.elementsFromPoint = vi.fn((x: number) => (x < 150 ? [button, document.body] : []))

    host = createOverlayHost(css)
    onExit = vi.fn<() => void>()
    render(<App host={host} language="en" onExit={onExit} />, { container: host.app })
  })

  afterEach(() => {
    cleanup()
    host.destroy()
    document.body.innerHTML = ''
  })

  it('P and the toolbar button toggle the picker; the hint follows', () => {
    expect(q('toolbar-picker')).toHaveAttribute('aria-pressed', 'false')
    press('p', 'KeyP')
    expect(useOverlayStore.getState().tool).toBe('picker')
    expect(q('toolbar-picker')).toHaveAttribute('aria-pressed', 'true')
    expect(q('toolbar-picker')).toHaveAttribute('data-active', 'true')
    expect(q('overlay-hint')).toHaveTextContent(/^Click to pick\s*·\s*Esc\s*turn off picker$/)

    fireEvent.click(q('toolbar-picker') as HTMLElement)
    expect(useOverlayStore.getState().tool).toBe('none')
    expect(q('overlay-hint')).toHaveTextContent(/^P\s*picker\s*·\s*A\s*area\s*·\s*Esc\s*exit$/)
  })

  it('Escape steps back: picker off first, then exit', () => {
    press('p', 'KeyP')
    press('Escape')
    expect(useOverlayStore.getState().tool).toBe('none')
    expect(onExit).not.toHaveBeenCalled()
    press('Escape')
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('highlights the node under the pointer with its box model and tooltip', async () => {
    press('p', 'KeyP')
    moveTo(120, 210)
    await nextFrame()

    const content = q('picker-highlight-content') as HTMLElement
    expect(content.style.left).toBe('116px')
    expect(content.style.top).toBe('210px')
    expect(content.style.width).toBe('214px')
    expect(content.style.height).toBe('20px')
    const margin = q('picker-highlight-margin') as HTMLElement
    expect(margin.style.top).toBe('184px')
    expect(margin.style.borderTopWidth).toBe('16px')
    expect(margin.style.borderLeftWidth).toBe('0px')

    expect(q('picker-tooltip-tag')).toHaveTextContent('button.card__cta')
    expect(q('picker-tooltip-size')).toHaveTextContent('246 × 40')
    expect(q('picker-tooltip-row-color')).toHaveTextContent('#FFFFFF')
    expect(q('picker-tooltip-row-background')).toHaveTextContent('#2563EB')
    expect(q('picker-tooltip-row-padding')).toHaveTextContent('10px 16px')
    expect(q('picker-tooltip-row-margin')).toHaveTextContent('16px 0 0')
    expect(q('picker-tooltip-row-display')).toHaveTextContent('flex')
    expect(q('picker-tooltip-row-radius')).toBeNull()

    // One frame per burst of moves, and nothing where there is no page element.
    moveTo(121, 210)
    moveTo(122, 210)
    moveTo(500, 210)
    await nextFrame()
    expect(q('picker-highlight')).toBeNull()
    expect(q('picker-tooltip')).toBeNull()
  })

  it('highlights nothing while the pointer is over our own UI', async () => {
    press('p', 'KeyP')
    const toolbar = q('toolbar') as HTMLElement
    toolbar.getBoundingClientRect = () =>
      ({ left: 100, top: 190, width: 400, height: 56, right: 500, bottom: 246 }) as DOMRect

    // The toolbar sits over the button: the page element under the pointer is not highlighted.
    moveTo(120, 210)
    await nextFrame()
    expect(q('picker-highlight')).toBeNull()
    expect(q('picker-tooltip')).toBeNull()

    moveTo(120, 300)
    await nextFrame()
    expect(q('picker-highlight')).not.toBeNull()
    expect(q('picker-tooltip')).not.toBeNull()
  })

  it('hides the tooltip under the pointer and keeps it hidden until the pointer leaves that spot', async () => {
    press('p', 'KeyP')
    moveTo(120, 210)
    await nextFrame()
    const tooltip = q('picker-tooltip') as HTMLElement
    expect(tooltip).not.toBeNull()
    tooltip.getBoundingClientRect = () =>
      ({ left: 100, top: 250, width: 290, height: 200, right: 390, bottom: 450 }) as DOMRect

    moveTo(130, 300)
    await nextFrame()
    expect(q('picker-tooltip')).toBeNull()
    expect(q('picker-highlight')).toBeNull()

    // Still inside the spot the tooltip occupied, although it is gone: no flicker.
    moveTo(140, 400)
    await nextFrame()
    expect(q('picker-highlight')).toBeNull()

    moveTo(120, 210)
    await nextFrame()
    expect(q('picker-highlight')).not.toBeNull()
    expect(q('picker-tooltip')).not.toBeNull()
  })

  it('re-renders the tooltip when the settings change, without a new hover', async () => {
    press('p', 'KeyP')
    moveTo(120, 210)
    await nextFrame()
    expect(q('picker-tooltip-row-color')).toHaveTextContent('#FFFFFF')

    act(() => {
      useSettingsStore.getState().update({ colorFormat: 'rgb', units: 'rem' })
      useSettingsStore.getState().toggleTooltipField('spacing', false)
    })
    expect(q('picker-tooltip-row-color')).toHaveTextContent('rgb(255, 255, 255)')
    expect(q('picker-tooltip-row-font')).toHaveTextContent('/')
    expect(q('picker-tooltip-row-padding')).toBeNull()
  })

  it('blocks page clicks only while the picker is active', () => {
    const onLink = vi.fn((event: Event) => event.preventDefault())
    const onButton = vi.fn()
    link.addEventListener('click', onLink)
    button.addEventListener('click', onButton)

    fireEvent.click(button)
    expect(onButton).toHaveBeenCalledTimes(1)

    press('p', 'KeyP')
    const blocked = fireEvent.click(link)
    expect(blocked).toBe(false)
    expect(onLink).not.toHaveBeenCalled()
    fireEvent.pointerDown(button)
    fireEvent.click(button, { detail: 1 })
    expect(onButton).toHaveBeenCalledTimes(1)

    press('p', 'KeyP')
    fireEvent.click(button)
    expect(onButton).toHaveBeenCalledTimes(2)
  })

  describe('locked', () => {
    const article = () => document.querySelector('article') as HTMLElement

    it('a click locks the node: frame, chip, breadcrumbs; Escape returns to picking', async () => {
      press('p', 'KeyP')
      fireEvent.click(button, { clientX: 120, clientY: 210, detail: 1 })
      expect(useOverlayStore.getState().pickerMode).toBe('locked')

      const frame = q('picker-locked-frame') as HTMLElement
      expect(frame.style.left).toBe('97px')
      expect(frame.style.top).toBe('197px')
      expect(frame.style.width).toBe('252px')
      expect(q('picker-locked-chip')).toHaveTextContent('.card__cta · 246 × 40')
      expect(q('picker-highlight')).toBeNull()
      expect(q('picker-tooltip')).toBeNull()
      expect(q('overlay-hint')).toBeNull()
      const crumbs = q('picker-breadcrumbs') as HTMLElement
      expect(crumbs.textContent).toContain('body')
      expect(crumbs.textContent).toContain('button.card__cta')
      expect(q('picker-breadcrumb-3')).toHaveAttribute('aria-current', 'true')
      // The key cap and the label are separated by a flex gap, the words by real spaces.
      expect(q('picker-hint-enter')).toHaveTextContent(/^Enter\s*issue · Coming soon$/)

      press('Escape')
      expect(useOverlayStore.getState().pickerMode).toBe('picking')
      expect(useOverlayStore.getState().tool).toBe('picker')
      expect(q('picker-locked-frame')).toBeNull()
      expect(q('overlay-hint')).not.toBeNull()
      expect(onExit).not.toHaveBeenCalled()
    })

    it('arrow keys walk the tree and are swallowed; nothing happens at the edges', () => {
      press('p', 'KeyP')
      fireEvent.click(button, { clientX: 120, clientY: 210, detail: 1 })

      const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
      act(() => {
        document.body.dispatchEvent(up)
      })
      expect(up.defaultPrevented).toBe(true)
      expect(q('picker-breadcrumb-2')).toHaveAttribute('aria-current', 'true')
      expect(q('picker-breadcrumb-2')).toHaveTextContent('article.product-card')
      // The trail below the new node stays visible.
      expect(q('picker-breadcrumb-3')).toHaveTextContent('button.card__cta')
      expect(q('picker-breadcrumb-3')).not.toHaveAttribute('aria-current')

      press('ArrowDown')
      expect(q('picker-breadcrumb-3')).toHaveTextContent('a.link')
      press('ArrowRight')
      expect(q('picker-breadcrumb-3')).toHaveTextContent('button.card__cta')
      press('ArrowRight')
      expect(q('picker-breadcrumb-3')).toHaveTextContent('button.card__cta')
      press('ArrowLeft')
      expect(q('picker-breadcrumb-3')).toHaveTextContent('a.link')

      press('ArrowUp')
      press('ArrowUp')
      press('ArrowUp')
      expect(q('picker-breadcrumb-0')).toHaveAttribute('aria-current', 'true')
      expect(q('picker-breadcrumb-0')).toHaveTextContent('body')
      press('ArrowUp')
      expect(q('picker-breadcrumb-0')).toHaveAttribute('aria-current', 'true')
      expect(q('picker-breadcrumb-3')).toHaveTextContent('a.link')
    })

    it('a breadcrumb or another page click re-locks', () => {
      press('p', 'KeyP')
      fireEvent.click(button, { clientX: 120, clientY: 210, detail: 1 })
      fireEvent.click(q('picker-breadcrumb-2') as HTMLElement)
      expect(q('picker-breadcrumb-2')).toHaveAttribute('aria-current', 'true')
      expect(q('picker-breadcrumb-2')).toHaveTextContent('article.product-card')

      // A page click on a node of the trail keeps it; a click elsewhere rebuilds the path.
      document.elementsFromPoint = vi.fn(() => [article(), document.body])
      fireEvent.click(article(), { clientX: 10, clientY: 10, detail: 1 })
      expect(q('picker-breadcrumb-2')).toHaveAttribute('aria-current', 'true')
      expect(q('picker-breadcrumb-3')).toHaveTextContent('button.card__cta')
      document.elementsFromPoint = vi.fn(() => [link, document.body])
      fireEvent.click(link, { clientX: 10, clientY: 10, detail: 1 })
      expect(q('picker-breadcrumb-3')).toHaveAttribute('aria-current', 'true')
      expect(q('picker-breadcrumb-3')).toHaveTextContent('a.link')
    })

    it('P turns the picker off from Locked and removes everything', () => {
      press('p', 'KeyP')
      fireEvent.click(button, { clientX: 120, clientY: 210, detail: 1 })
      press('p', 'KeyP')
      expect(useOverlayStore.getState().tool).toBe('none')
      expect(q('picker-locked-frame')).toBeNull()
      expect(q('picker-locked-bar')).toBeNull()
      const down = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      })
      document.body.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(false)
    })
  })

  it('covers iframes with shields while picking and locks the frame on click', () => {
    const iframe = document.createElement('iframe')
    iframe.className = 'frame'
    iframe.getBoundingClientRect = () =>
      ({ left: 10, top: 300, width: 400, height: 160, right: 410, bottom: 460 }) as DOMRect
    document.querySelector('main')?.append(iframe)

    press('p', 'KeyP')
    const shield = q('picker-shield-0') as HTMLElement
    expect(shield.style.left).toBe('10px')
    expect(shield.style.width).toBe('400px')

    document.elementsFromPoint = vi.fn(() => [host.host, iframe, document.body])
    fireEvent.click(shield, { clientX: 50, clientY: 350 })
    expect(useOverlayStore.getState().pickerMode).toBe('locked')
    expect(q('picker-locked-chip')).toHaveTextContent('.frame')
    // Still covered in Locked: a click into the frame must not reach the frame's page.
    expect(q('picker-shield-0')).not.toBeNull()
  })

  it('ignores keyboard-activated page clicks for locking', () => {
    press('p', 'KeyP')
    fireEvent.click(button, { clientX: 0, clientY: 0, detail: 0 })
    expect(useOverlayStore.getState().pickerMode).toBe('picking')
  })

  it('ignores synthetic pointer moves from the page', async () => {
    press('p', 'KeyP')
    trustSyntheticEventsForTests(false)
    moveTo(120, 210)
    await nextFrame()
    expect(q('picker-highlight')).toBeNull()
  })

  it('leaves arrow keys to the page while picking', () => {
    press('p', 'KeyP')
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
