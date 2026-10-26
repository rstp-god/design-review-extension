// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSession } from '@tests/fixtures/data'
import { type ChromeMock, installChromeMock } from '@tests/mocks/chrome'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOverlayHost, type OverlayHost } from '@/content/host'
import { App } from '@/content/overlay/App'
import { useOverlayStore } from '@/content/store/overlay'
import { createI18n } from '@/i18n'
import { TOOLBAR_STATE_KEY } from '@/shared/constants'
import { trustSyntheticEventsForTests } from '@/shared/trustedEvents'

const css = ':host{all:initial}'

function renderOverlay(onExit = vi.fn()) {
  const host = createOverlayHost(css)
  const result = render(<App host={host} i18n={createI18n('en')} onExit={onExit} />, {
    container: host.app,
  })
  return { host, onExit, ...result }
}

/** Queries must look inside the shadow root; `screen` only sees the light DOM. */
function within(host: OverlayHost) {
  return {
    byTestId: (id: string) => host.shadowRoot.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    allButtons: () => [...host.shadowRoot.querySelectorAll('button')],
  }
}

describe('overlay app', () => {
  let mock: ChromeMock

  beforeEach(() => {
    mock = installChromeMock()
    useOverlayStore.setState({ session: null, collapsed: false, position: null, pagePath: '/' })
  })

  afterEach(() => {
    cleanup()
    for (const node of document.querySelectorAll('dr-overlay')) node.remove()
  })

  it('renders the toolbar with live grip / collapse / exit and soft-disabled tools', async () => {
    const { host } = renderOverlay()
    const q = within(host)

    const toolbar = q.byTestId('toolbar')
    expect(toolbar).toHaveAttribute('role', 'toolbar')
    expect(toolbar).toHaveAttribute('aria-label', 'Design Review toolbar')

    for (const id of [
      'toolbar-picker',
      'toolbar-area',
      'toolbar-freeze',
      'toolbar-issues',
      'toolbar-export',
    ]) {
      expect(q.byTestId(id), id).toHaveAttribute('aria-disabled', 'true')
    }
    for (const id of ['toolbar-grip', 'toolbar-collapse', 'toolbar-exit']) {
      expect(q.byTestId(id), id).not.toHaveAttribute('aria-disabled')
    }
    expect(q.byTestId('overlay-hint')).toHaveTextContent('Esc')
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('shows the issue count badge from the session', () => {
    const { host } = renderOverlay()
    const q = within(host)
    expect(q.byTestId('toolbar-issues-badge')).toBeNull()

    act(() => {
      useOverlayStore.getState().setSession({
        session: makeSession(),
        issueCount: 7,
        pageCount: 2,
        bySeverity: { blocker: 1, major: 3, minor: 3 },
      })
    })
    expect(q.byTestId('toolbar-issues-badge')).toHaveTextContent('7')
  })

  it('collapses to a round button and expands back, persisting the flag', async () => {
    const user = userEvent.setup()
    const { host } = renderOverlay()
    const q = within(host)

    await user.click(q.byTestId('toolbar-collapse') as HTMLElement)
    expect(q.byTestId('toolbar')).toBeNull()
    const collapsed = q.byTestId('toolbar-collapsed')
    expect(collapsed).toHaveAttribute('aria-label', 'Expand the toolbar')
    await waitFor(() =>
      expect(mock.storage.local.data.get(TOOLBAR_STATE_KEY)).toMatchObject({ collapsed: true }),
    )

    await user.click(collapsed as HTMLElement)
    expect(q.byTestId('toolbar')).not.toBeNull()
    await waitFor(() =>
      expect(mock.storage.local.data.get(TOOLBAR_STATE_KEY)).toMatchObject({ collapsed: false }),
    )
  })

  it('exits from the button and from Escape, and only then', async () => {
    const user = userEvent.setup()
    const { host, onExit } = renderOverlay()
    const q = within(host)

    fireEvent.keyDown(document.body, { key: 'p', code: 'KeyP' })
    expect(onExit).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)

    await user.click(q.byTestId('toolbar-exit') as HTMLElement)
    expect(onExit).toHaveBeenCalledTimes(2)
  })

  it('ignores synthetic clicks and drags from the page', async () => {
    const user = userEvent.setup()
    const { host, onExit } = renderOverlay()
    const q = within(host)
    trustSyntheticEventsForTests(false)

    await user.click(q.byTestId('toolbar-exit') as HTMLElement)
    expect(onExit).not.toHaveBeenCalled()
    await user.click(q.byTestId('toolbar-collapse') as HTMLElement)
    expect(q.byTestId('toolbar')).not.toBeNull()

    const grip = q.byTestId('toolbar-grip') as HTMLElement
    fireEvent.pointerDown(grip, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(grip, { clientX: 300, clientY: 300, pointerId: 1 })
    expect(useOverlayStore.getState().position).toBeNull()
    expect(mock.storage.local.data.has(TOOLBAR_STATE_KEY)).toBe(false)
  })

  it('drags by the grip, clamps to the viewport and persists the position', async () => {
    const { host } = renderOverlay()
    const q = within(host)
    const grip = q.byTestId('toolbar-grip') as HTMLElement
    const toolbar = q.byTestId('toolbar') as HTMLElement
    window.innerWidth = 1280
    window.innerHeight = 720
    toolbar.getBoundingClientRect = () =>
      ({ left: 800, top: 16, width: 400, height: 56, right: 1200, bottom: 72 }) as DOMRect
    grip.getBoundingClientRect = toolbar.getBoundingClientRect

    fireEvent.pointerDown(grip, { button: 0, clientX: 810, clientY: 30, pointerId: 1 })
    fireEvent.pointerMove(grip, { clientX: 710, clientY: 130, pointerId: 1 })
    expect(useOverlayStore.getState().position).toEqual({ x: 700, y: 116 })

    fireEvent.pointerMove(grip, { clientX: -500, clientY: -500, pointerId: 1 })
    expect(useOverlayStore.getState().position).toEqual({ x: 0, y: 0 })

    fireEvent.pointerUp(grip, { clientX: -500, clientY: -500, pointerId: 1 })
    await waitFor(() =>
      expect(mock.storage.local.data.get(TOOLBAR_STATE_KEY)).toEqual({
        x: 0,
        y: 0,
        collapsed: false,
      }),
    )
    expect(toolbar.style.left).toBe('0px')
  })

  it('restores a saved position on mount', async () => {
    await mock.storage.local.set({ [TOOLBAR_STATE_KEY]: { x: 120, y: 40, collapsed: false } })
    const { host } = renderOverlay()
    const q = within(host)
    await waitFor(() => expect(useOverlayStore.getState().position).toEqual({ x: 120, y: 40 }))
    expect((q.byTestId('toolbar') as HTMLElement).style.top).toBe('40px')
  })

  it('applies the toolbar theme to the host', async () => {
    const { host } = renderOverlay()
    expect(host.host.dataset.theme).toBe('dark')
    const { useSettingsStore } = await import('@/store/settings')
    act(() => {
      useSettingsStore.getState().update({ theme: 'light' })
    })
    expect(host.host.dataset.theme).toBe('light')
    act(() => {
      useSettingsStore.getState().update({ theme: 'system' })
    })
    expect(host.host.dataset.theme).toBe('dark')
  })
})
