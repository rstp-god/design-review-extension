// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TestId } from '@tests/constants/testIds'
import { makeSession, makeSettingsEnvelope } from '@tests/fixtures/data'
import { type ChromeMock, installChromeMock, mockTab } from '@tests/mocks/chrome'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY } from '@/shared/constants'
import { createMessageListener, type MessageHandlers } from '@/shared/messaging'
import type { SessionSummary } from '@/shared/model'

const shop = makeSession()
const landing = makeSession({
  id: 'session-landing',
  scope: 'page',
  key: 'https://landing.example.ru/promo',
  origin: 'https://landing.example.ru',
  path: '/promo',
  updatedAt: '2026-01-10T12:00:00.000Z',
})

function summary(session: typeof shop, issueCount = 0, pageCount = 0): SessionSummary {
  return { session, issueCount, pageCount, bySeverity: { blocker: 0, major: issueCount, minor: 0 } }
}

/** Answers background messages the way the service worker would. */
function background(mock: ChromeMock, sessions: SessionSummary[], extra: MessageHandlers = {}) {
  const deleteAll = vi.fn(async () => {
    sessions.length = 0
    return { ok: true as const }
  })
  mock.runtime.onMessage.addListener(
    createMessageListener({
      'session/list': async () => sessions,
      'storage/usage': async () => ({
        bytes: 13_002_342,
        quota: 1_000_000_000,
        sessions: sessions.length,
      }),
      'review/start': async () => ({ ok: true }),
      'session/deleteAll': deleteAll,
      ...extra,
    }),
  )
  return { deleteAll }
}

/**
 * A fresh module registry per test: the settings store is a module singleton bound to the chrome
 * mock at creation. Everything with React context must come from the same registry as `App`.
 */
async function renderPopup() {
  vi.resetModules()
  const [{ App }, { FloatingRootProvider }, { createI18n }] = await Promise.all([
    import('@/popup/App'),
    import('@/ui'),
    import('@/i18n'),
  ])
  const floating = document.createElement('div')
  document.body.append(floating)
  const i18n = createI18n('en')
  const result = render(
    <I18nextProvider i18n={i18n}>
      <FloatingRootProvider container={floating}>
        <App />
      </FloatingRootProvider>
    </I18nextProvider>,
  )
  await waitFor(() =>
    expect(screen.getByTestId(TestId.PopupRoot)).toHaveAttribute('data-status', 'ready'),
  )
  return result
}

describe('popup', () => {
  let mock: ChromeMock

  beforeEach(() => {
    mock = installChromeMock()
    mock.tabs.query.mockResolvedValue([
      mockTab({ id: 3, url: 'https://shop.example.ru/catalog?page=2' }),
    ])
    vi.stubGlobal('close', vi.fn())
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  it('first run: onboarding, start button, no recent sessions', async () => {
    background(mock, [])
    await renderPopup()

    expect(screen.getByTestId(TestId.PopupOnboarding)).toBeInTheDocument()
    expect(screen.getByTestId(TestId.PopupSessionHost)).toHaveTextContent('shop.example.ru')
    expect(screen.getByTestId(TestId.PopupStart)).toHaveTextContent('Start review')
    expect(screen.getByTestId(TestId.PopupStart)).toBeEnabled()
    expect(screen.queryByTestId(TestId.PopupRecent)).toBeNull()
    expect(screen.getByTestId(TestId.PopupShortcut)).toHaveTextContent('Alt')
    expect(screen.getByTestId(TestId.PopupStorage)).toHaveTextContent('12.4 MB')
    expect(screen.getByTestId(TestId.PopupVersion)).toHaveTextContent('v0.1.0')
  })

  it('no session here but sessions elsewhere: no onboarding, recent list, scope from settings', async () => {
    await mock.storage.sync.set({ [SETTINGS_KEY]: makeSettingsEnvelope({ sessionScope: 'page' }) })
    background(mock, [summary(landing, 4)])
    await renderPopup()

    expect(screen.queryByTestId(TestId.PopupOnboarding)).toBeNull()
    expect(screen.getByTestId(TestId.PopupSessionScope)).toHaveTextContent('By page')
    expect(screen.getByTestId(TestId.PopupSessionHost)).toHaveTextContent('shop.example.ru/catalog')
    const recent = screen.getByTestId(TestId.PopupRecent)
    expect(within(recent).getByText('landing.example.ru/promo')).toBeInTheDocument()
    expect(within(recent).getByText(/By page · 4 issues/)).toBeInTheDocument()
    expect(within(recent).getByRole('button', { name: 'Session actions' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('with a session: summary, continue, disabled export, current session not in recent', async () => {
    background(mock, [summary(shop, 12, 3), summary(landing, 4)])
    await renderPopup()

    expect(screen.getByTestId(TestId.PopupSessionSummary)).toHaveTextContent('12 issues')
    expect(screen.getByTestId(TestId.PopupSessionSummary)).toHaveTextContent('3 pages')
    expect(screen.getByTestId(TestId.PopupSessionPath)).toHaveTextContent('/catalog')
    expect(screen.getByTestId(TestId.PopupStart)).toHaveTextContent('Continue review')
    expect(screen.getByTestId(TestId.PopupExportHtml)).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId(TestId.PopupExportPdf)).toHaveAttribute('aria-disabled', 'true')
    expect(within(screen.getByTestId(TestId.PopupRecent)).queryByText('shop.example.ru')).toBeNull()
  })

  it('starts the review on the active tab and closes', async () => {
    const start = vi.fn(async () => ({ ok: true as const }))
    background(mock, [], { 'review/start': start })
    await renderPopup()

    await userEvent.click(screen.getByTestId(TestId.PopupStart))
    await waitFor(() => expect(start).toHaveBeenCalledWith({ tabId: 3 }, expect.anything()))
    await waitFor(() => expect(window.close).toHaveBeenCalled())
  })

  it('shows an error when the start fails', async () => {
    background(mock, [], {
      'review/start': async () => {
        throw new Error('nope')
      },
    })
    await renderPopup()

    await userEvent.click(screen.getByTestId(TestId.PopupStart))
    expect(await screen.findByTestId(TestId.PopupError)).toHaveTextContent('Could not start')
    expect(window.close).not.toHaveBeenCalled()
  })

  it('a failed session list is not mistaken for a first run', async () => {
    mock.runtime.onMessage.addListener(
      createMessageListener({
        'session/list': async () => {
          throw new Error('worker restarting')
        },
        'storage/usage': async () => ({ bytes: 0, sessions: 0 }),
      }),
    )
    await renderPopup()

    expect(screen.queryByTestId(TestId.PopupOnboarding)).toBeNull()
    expect(screen.queryByTestId(TestId.PopupRecent)).toBeNull()
    expect(screen.getByTestId(TestId.PopupStart)).toBeEnabled()
  })

  it('restricted page: notice, disabled start, recent sessions still listed', async () => {
    mock.tabs.query.mockResolvedValue([mockTab({ id: 4, url: 'chrome://extensions/' })])
    background(mock, [summary(shop, 7, 1)])
    await renderPopup()

    expect(screen.getByTestId(TestId.PopupRestricted)).toHaveTextContent(
      'Reviews are not available here',
    )
    expect(screen.getByTestId(TestId.PopupStart)).toBeDisabled()
    expect(screen.queryByTestId(TestId.PopupShortcut)).toBeNull()
    expect(screen.queryByTestId(TestId.PopupOnboarding)).toBeNull()
    expect(screen.getByTestId(TestId.PopupRecent)).toHaveTextContent('shop.example.ru')
  })

  it('offers to set up the hotkey when the command is unbound', async () => {
    mock.commands.getAll.mockResolvedValue([
      { name: 'toggle-review', shortcut: '', description: '' },
    ])
    background(mock, [])
    await renderPopup()

    const shortcut = screen.getByTestId(TestId.PopupShortcut)
    expect(shortcut).toHaveTextContent('No hotkey assigned')
    await userEvent.click(screen.getByTestId(TestId.PopupShortcutSetup))
    expect(mock.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })
  })

  it('settings: a failed delete-all is reported', async () => {
    const user = userEvent.setup()
    background(mock, [summary(shop, 1, 1)], {
      'session/deleteAll': async () => {
        throw new Error('blocked')
      },
    })
    await renderPopup()
    await user.click(screen.getByTestId(TestId.PopupSettingsButton))
    await waitFor(() =>
      expect(screen.getByTestId(TestId.SettingsRoot)).toHaveAttribute('data-hydrated', 'true'),
    )

    await user.click(screen.getByTestId(TestId.SettingsDeleteAll))
    await user.click(await screen.findByTestId(TestId.SettingsDeleteAllConfirm))
    expect(await screen.findByTestId(TestId.SettingsDeleteAllError)).toHaveTextContent(
      'Could not delete',
    )
    expect(screen.getByTestId(TestId.SettingsStorageUsage)).toHaveTextContent('1 session')
  })

  it('settings: every control writes to the store, delete-all asks first', async () => {
    const user = userEvent.setup()
    const { deleteAll } = background(mock, [summary(shop, 1, 1)])
    await renderPopup()
    const { useSettingsStore } = await import('@/store/settings')

    await user.click(screen.getByTestId(TestId.PopupSettingsButton))
    const root = await screen.findByTestId(TestId.SettingsRoot)
    await waitFor(() => expect(root).toHaveAttribute('data-hydrated', 'true'))

    await user.click(screen.getByTestId('setting-scope-option-page'))
    expect(useSettingsStore.getState().sessionScope).toBe('page')
    expect(root).toHaveTextContent('Each page is its own session')

    await user.type(screen.getByTestId(TestId.SettingReviewer), 'Anna')
    expect(useSettingsStore.getState().reviewer).toBe('Anna')

    await user.click(screen.getByTestId('setting-report-lang-option-ru'))
    await user.click(screen.getByTestId('setting-shot-quality-option-high'))
    await user.click(screen.getByTestId('setting-tooltip-field-radius'))
    await user.click(screen.getByTestId('setting-color-format-option-hsl'))
    await user.click(screen.getByTestId('setting-units-option-rem'))
    await user.click(screen.getByTestId('setting-crop-padding-option-48'))
    await user.click(screen.getByTestId('setting-freeze-delay-option-10'))
    await user.click(screen.getByTestId('setting-default-severity-option-blocker'))
    await user.click(screen.getByTestId('setting-theme-option-light'))

    expect(useSettingsStore.getState()).toMatchObject({
      reportLang: 'ru',
      shotQuality: 'high',
      colorFormat: 'hsl',
      units: 'rem',
      cropPadding: 48,
      freezeDelay: 10,
      defaultSeverity: 'blocker',
      theme: 'light',
    })
    expect(useSettingsStore.getState().tooltipFields).toContain('radius')

    expect(root).toHaveTextContent('Start / stop review')
    expect(screen.getByTestId(TestId.SettingsStorageUsage)).toHaveTextContent('12.4 MB · 1 session')

    await user.click(screen.getByTestId(TestId.SettingsShortcutsLink))
    expect(mock.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })

    await user.click(screen.getByTestId(TestId.SettingsDeleteAll))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete all sessions?')
    await user.click(screen.getByTestId(TestId.SettingsDeleteAllCancel))
    expect(deleteAll).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByTestId(TestId.SettingsDeleteAll))
    await user.click(await screen.findByTestId(TestId.SettingsDeleteAllConfirm))
    await waitFor(() => expect(deleteAll).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByTestId(TestId.SettingsStorageUsage)).toHaveTextContent('0 sessions'),
    )

    await user.click(screen.getByTestId(TestId.PopupBackButton))
    expect(await screen.findByTestId(TestId.PopupRoot)).toBeInTheDocument()
  })
})
