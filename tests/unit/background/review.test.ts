import 'fake-indexeddb/auto'
import { makeIssue, makeSession, makeSettingsEnvelope } from '@tests/fixtures/data'
import { type ChromeMock, installChromeMock, mockTab } from '@tests/mocks/chrome'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, putIssue, putSession } from '@/background/db'
import { injectOverlay, isOverlayActive } from '@/background/inject'
import { RestrictedPageError, startReview, stopReview, toggleReview } from '@/background/review'
import { CONTENT_SCRIPT_FILE, SETTINGS_KEY } from '@/shared/constants'

const TAB_ID = 7
const URL = 'https://shop.example.ru/catalog?page=2'

/** Reply shape of a tab message, as the content script would send it. */
const reply = (data: unknown) => ({ ok: true, data })

describe('background review orchestration', () => {
  let mock: ChromeMock

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    mock = installChromeMock()
    mock.tabs.get.mockResolvedValue(mockTab({ id: TAB_ID, url: URL }))
  })

  afterEach(async () => {
    await closeDb()
  })

  /** No overlay in the tab: status fails like Chrome does without a receiver. */
  function overlayAbsent() {
    mock.tabs.sendMessage.mockImplementation(async (_tabId, message) => {
      const { type } = message as { type: string }
      if (type === 'review/status') {
        throw new Error('Could not establish connection. Receiving end does not exist.')
      }
      return reply({ ok: true })
    })
  }

  function overlayPresent() {
    mock.tabs.sendMessage.mockImplementation(async (_tabId, message) => {
      const { type } = message as { type: string }
      return type === 'review/status' ? reply({ active: true }) : reply({ ok: true })
    })
  }

  it('isOverlayActive treats a missing receiver as inactive', async () => {
    overlayAbsent()
    expect(await isOverlayActive(TAB_ID)).toBe(false)
    overlayPresent()
    expect(await isOverlayActive(TAB_ID)).toBe(true)
  })

  it('injects the content script and the main-world history patch when the overlay is absent', async () => {
    overlayAbsent()
    await injectOverlay(TAB_ID)

    expect(mock.scripting.executeScript).toHaveBeenCalledTimes(2)
    expect(mock.scripting.executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: TAB_ID },
      files: [CONTENT_SCRIPT_FILE],
    })
    expect(mock.scripting.executeScript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ target: { tabId: TAB_ID }, world: 'MAIN' }),
    )
  })

  it('does not inject the content script twice', async () => {
    overlayPresent()
    await injectOverlay(TAB_ID)

    const fileInjections = mock.scripting.executeScript.mock.calls.filter(
      ([injection]) => 'files' in injection,
    )
    expect(fileInjections).toHaveLength(0)
  })

  it('startReview opens the overlay with the session of the current scope', async () => {
    overlayAbsent()
    await mock.storage.sync.set({
      [SETTINGS_KEY]: makeSettingsEnvelope({ sessionScope: 'domain' }),
    })
    const session = makeSession()
    await putSession(session)
    await putIssue(makeIssue({ number: 1 }))

    await startReview(TAB_ID)

    const open = mock.tabs.sendMessage.mock.calls.find(
      ([, message]) => (message as { type: string }).type === 'review/open',
    )
    expect(open?.[0]).toBe(TAB_ID)
    expect(open?.[1]).toEqual({
      type: 'review/open',
      payload: {
        session: {
          session,
          issueCount: 1,
          pageCount: 1,
          bySeverity: { blocker: 0, major: 1, minor: 0 },
        },
      },
    })
  })

  it('startReview passes null when the page has no session in the current scope', async () => {
    overlayAbsent()
    await mock.storage.sync.set({ [SETTINGS_KEY]: makeSettingsEnvelope({ sessionScope: 'page' }) })
    await putSession(makeSession()) // domain-scoped, must not match a page-scoped lookup

    await startReview(TAB_ID)

    const open = mock.tabs.sendMessage.mock.calls.find(
      ([, message]) => (message as { type: string }).type === 'review/open',
    )
    expect(open?.[1]).toEqual({ type: 'review/open', payload: { session: null } })
  })

  it('startReview refuses restricted pages before touching the tab', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: TAB_ID, url: 'chrome://extensions/' }))

    await expect(startReview(TAB_ID)).rejects.toBeInstanceOf(RestrictedPageError)
    expect(mock.scripting.executeScript).not.toHaveBeenCalled()
  })

  it('stopReview closes the overlay and ignores tabs without one', async () => {
    overlayPresent()
    await stopReview(TAB_ID)
    expect(mock.tabs.sendMessage).toHaveBeenCalledWith(TAB_ID, {
      type: 'review/close',
      payload: {},
    })

    overlayAbsent()
    mock.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist.'))
    await expect(stopReview(TAB_ID)).resolves.toBeUndefined()
  })

  it('toggleReview starts when inactive and stops when active', async () => {
    overlayAbsent()
    await expect(toggleReview(TAB_ID, URL)).resolves.toBe('started')
    expect(mock.scripting.executeScript).toHaveBeenCalled()

    overlayPresent()
    vi.clearAllMocks()
    await expect(toggleReview(TAB_ID, URL)).resolves.toBe('stopped')
    expect(mock.scripting.executeScript).not.toHaveBeenCalled()
  })
})
