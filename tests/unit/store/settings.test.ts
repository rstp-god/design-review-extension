import { makeSettingsEnvelope } from '@tests/fixtures/data'
import { type ChromeMock, installChromeMock } from '@tests/mocks/chrome'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY } from '@/shared/constants'
import { defaultSettings } from '@/shared/model'

/** The store module reads `chrome` at creation, so every test gets a fresh module instance. */
async function loadStore() {
  vi.resetModules()
  const { useSettingsStore } = await import('@/store/settings')
  await vi.waitFor(() => expect(useSettingsStore.getState().hydrated).toBe(true))
  return useSettingsStore
}

describe('settings store', () => {
  let mock: ChromeMock

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mock = installChromeMock()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts from defaults in the UI language and writes nothing until something changes', async () => {
    mock.i18n.getUILanguage.mockReturnValue('ru')
    const store = await loadStore()

    expect(store.getState().reportLang).toBe('ru')
    expect(store.getState().sessionScope).toBe('domain')
    await vi.advanceTimersByTimeAsync(200)
    expect(mock.storage.sync.data.has(SETTINGS_KEY)).toBe(false)

    store.getState().update({ theme: 'dark' })
    await vi.advanceTimersByTimeAsync(200)
    const stored = mock.storage.sync.data.get(SETTINGS_KEY) as {
      state: unknown
      meta: { rev: number }
    }
    expect(stored.state).toEqual({ ...defaultSettings('ru'), theme: 'dark' })
    expect(stored.meta.rev).toBe(1)
  })

  it('hydrates from the stored envelope and does not write it back unchanged', async () => {
    await mock.storage.sync.set({
      [SETTINGS_KEY]: makeSettingsEnvelope({ sessionScope: 'page', reviewer: 'Anna' }, 4),
    })
    mock.storage.sync.set.mockClear()

    const store = await loadStore()
    expect(store.getState().sessionScope).toBe('page')
    expect(store.getState().reviewer).toBe('Anna')

    await vi.advanceTimersByTimeAsync(200)
    expect(mock.storage.sync.set).not.toHaveBeenCalled()
  })

  it('persists updates with a debounce and increments the revision', async () => {
    await mock.storage.sync.set({ [SETTINGS_KEY]: makeSettingsEnvelope({}, 4) })
    const store = await loadStore()

    store.getState().update({ theme: 'light' })
    store.getState().update({ units: 'rem' })
    await vi.advanceTimersByTimeAsync(50)
    expect(mock.storage.sync.data.get(SETTINGS_KEY)).toMatchObject({ meta: { rev: 4 } })

    await vi.advanceTimersByTimeAsync(200)
    const stored = mock.storage.sync.data.get(SETTINGS_KEY) as {
      state: { theme: string; units: string }
      meta: { rev: number }
    }
    expect(stored.state.theme).toBe('light')
    expect(stored.state.units).toBe('rem')
    expect(stored.meta.rev).toBe(5)
  })

  it('applies changes written by another context and ignores stale ones', async () => {
    await mock.storage.sync.set({ [SETTINGS_KEY]: makeSettingsEnvelope({}, 4) })
    const store = await loadStore()

    await mock.storage.sync.set({ [SETTINGS_KEY]: makeSettingsEnvelope({ colorFormat: 'hsl' }, 5) })
    expect(store.getState().colorFormat).toBe('hsl')

    await mock.storage.sync.set({ [SETTINGS_KEY]: makeSettingsEnvelope({ colorFormat: 'rgb' }, 2) })
    expect(store.getState().colorFormat).toBe('hsl')

    await mock.storage.sync.set({ [SETTINGS_KEY]: 'garbage' })
    expect(store.getState().colorFormat).toBe('hsl')
  })

  it('toggles tooltip fields without duplicates', async () => {
    const store = await loadStore()
    store.getState().toggleTooltipField('radius', true)
    store.getState().toggleTooltipField('radius', true)
    expect(store.getState().tooltipFields.filter((field) => field === 'radius')).toHaveLength(1)
    store.getState().toggleTooltipField('typography', false)
    expect(store.getState().tooltipFields).not.toContain('typography')
  })

  it('ignores changes until hydrated, then persists a pre-hydration change only if nothing was stored', async () => {
    await mock.storage.sync.set({ [SETTINGS_KEY]: makeSettingsEnvelope({ theme: 'dark' }, 3) })
    mock.storage.sync.set.mockClear()
    // A slow read keeps the store un-hydrated long enough to act on it.
    const realGet = mock.storage.sync.get.getMockImplementation()
    mock.storage.sync.get.mockImplementationOnce(
      (keys) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(realGet?.(keys) ?? {}), 50)
        }),
    )
    vi.resetModules()
    const { useSettingsStore } = await import('@/store/settings')
    expect(useSettingsStore.getState().hydrated).toBe(false)

    // A click that lands before the read finished: it must not overwrite the stored envelope.
    useSettingsStore.getState().update({ theme: 'light' })
    await vi.advanceTimersByTimeAsync(200)
    expect(mock.storage.sync.set).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(useSettingsStore.getState().hydrated).toBe(true))
    await vi.advanceTimersByTimeAsync(200)
    expect(useSettingsStore.getState().theme).toBe('dark')
    expect(mock.storage.sync.set).not.toHaveBeenCalled()
  })

  it('persists a pre-hydration change when the storage was empty', async () => {
    vi.resetModules()
    const { useSettingsStore } = await import('@/store/settings')
    useSettingsStore.getState().update({ units: 'rem' })
    await vi.waitFor(() => expect(useSettingsStore.getState().hydrated).toBe(true))
    await vi.advanceTimersByTimeAsync(200)
    const stored = mock.storage.sync.data.get(SETTINGS_KEY) as { state: { units: string } }
    expect(stored.state.units).toBe('rem')
  })

  it('retries after a rejected sync write', async () => {
    const store = await loadStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mock.storage.sync.set.mockRejectedValueOnce(new Error('quota'))

    store.getState().update({ reviewer: 'A' })
    await vi.advanceTimersByTimeAsync(200)
    expect(warn).toHaveBeenCalled()
    expect(mock.storage.sync.data.has(SETTINGS_KEY)).toBe(false)

    await store.getState().commit()
    const stored = mock.storage.sync.data.get(SETTINGS_KEY) as { state: { reviewer: string } }
    expect(stored.state.reviewer).toBe('A')
  })
})
