import { mockTab } from '@tests/mocks/chrome'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleCommand } from '@/background/commands'
import { RestrictedPageError, toggleReview } from '@/background/review'

vi.mock('@/background/review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/background/review')>()
  return { ...actual, toggleReview: vi.fn() }
})

const toggle = vi.mocked(toggleReview)

describe('toggle-review command', () => {
  beforeEach(() => {
    toggle.mockReset()
  })

  it('toggles the review on the tab the command fired for', async () => {
    toggle.mockResolvedValue('started')
    await handleCommand('toggle-review', mockTab({ id: 5, url: 'https://a.ru/' }))
    expect(toggle).toHaveBeenCalledWith(5, 'https://a.ru/')
  })

  it('ignores other commands and tabs without an id', async () => {
    await handleCommand('something-else', mockTab({ id: 5 }))
    await handleCommand('toggle-review', undefined)
    await handleCommand('toggle-review', mockTab({ id: undefined }))
    expect(toggle).not.toHaveBeenCalled()
  })

  it('stays quiet on restricted pages and logs other failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    toggle.mockRejectedValueOnce(new RestrictedPageError())
    await handleCommand('toggle-review', mockTab({ id: 5, url: 'chrome://extensions/' }))
    expect(warn).not.toHaveBeenCalled()

    toggle.mockRejectedValueOnce(new Error('boom'))
    await handleCommand('toggle-review', mockTab({ id: 5 }))
    expect(warn).toHaveBeenCalledWith('[commands] toggle-review failed:', 'boom')
  })
})
