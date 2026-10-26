import { installChromeMock } from '@tests/mocks/chrome'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearMemoryStorage,
  getArea,
  onStorageChanged,
  removeArea,
  setArea,
} from '@/services/chrome/storage'

describe('chrome storage wrapper', () => {
  afterEach(() => {
    clearMemoryStorage()
  })

  it('falls back to memory outside the extension', async () => {
    expect(typeof chrome).toBe('undefined')
    expect(await getArea('local', 'k')).toBeNull()

    await setArea('local', 'k', { a: 1 })
    expect(await getArea('local', 'k')).toEqual({ a: 1 })
    expect(await getArea('sync', 'k')).toBeNull()

    await removeArea('local', 'k')
    expect(await getArea('local', 'k')).toBeNull()

    expect(onStorageChanged(() => {})).toBeTypeOf('function')
  })

  it('reads and writes through chrome.storage when present', async () => {
    const mock = installChromeMock()
    const listener = vi.fn()
    const unsubscribe = onStorageChanged(listener)

    await setArea('sync', 'settings', { theme: 'dark' })
    expect(mock.storage.sync.data.get('settings')).toEqual({ theme: 'dark' })
    expect(await getArea('sync', 'settings')).toEqual({ theme: 'dark' })
    expect(listener).toHaveBeenCalledWith(
      { settings: { oldValue: undefined, newValue: { theme: 'dark' } } },
      'sync',
    )

    unsubscribe()
    await removeArea('sync', 'settings')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(await getArea('sync', 'settings')).toBeNull()
  })

  it('swallows a failed sync write but rethrows a failed local write', async () => {
    const mock = installChromeMock()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mock.storage.sync.set.mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'))
    mock.storage.local.set.mockRejectedValueOnce(new Error('disk'))

    await expect(setArea('sync', 'k', 1)).resolves.toBe(false)
    expect(warn).toHaveBeenCalled()
    await expect(setArea('local', 'k', 1)).rejects.toThrow('disk')
  })
})
