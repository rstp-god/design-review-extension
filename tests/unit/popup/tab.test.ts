import { installChromeMock, mockTab } from '@tests/mocks/chrome'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePopupTab } from '@/popup/tab'

describe('resolvePopupTab', () => {
  const active = mockTab({ id: 1, url: 'https://shop.example.ru/' })
  const other = mockTab({ id: 9, url: 'https://other.example.ru/' })

  beforeEach(() => {
    const mock = installChromeMock()
    mock.tabs.query.mockResolvedValue([active])
    mock.tabs.get.mockImplementation(async (tabId) => {
      if (tabId === 9) return other
      throw new Error('No tab')
    })
  })

  it('returns the active tab by default', async () => {
    expect(await resolvePopupTab('')).toEqual(active)
    expect(await resolvePopupTab('?tab=abc')).toEqual(active)
  })

  it('honours ?tab=<id> in dev / E2E builds only', async () => {
    const allowed = import.meta.env.DEV || import.meta.env.VITE_E2E === '1'
    const resolved = await resolvePopupTab('?tab=9')
    expect(resolved).toEqual(allowed ? other : active)
  })

  it('falls back to null when the requested tab does not exist', async () => {
    vi.stubEnv('VITE_E2E', '1')
    expect(await resolvePopupTab('?tab=42')).toBeNull()
  })
})
