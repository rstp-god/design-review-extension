// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { applyTheme, resolveTheme } from '@/content/theme'

function fakeWindow(prefersLight: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches: prefersLight,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  const win = { matchMedia: vi.fn(() => media) } as unknown as Window
  return {
    win,
    listeners,
    flip() {
      media.matches = !media.matches
      for (const listener of listeners) listener()
    },
  }
}

describe('theme', () => {
  it('resolves system to the OS preference', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })

  it('writes data-theme and follows the OS only in system mode', () => {
    const host = document.createElement('div')
    const { win, listeners, flip } = fakeWindow(true)

    const stop = applyTheme(host, 'system', win)
    expect(host.dataset.theme).toBe('light')
    flip()
    expect(host.dataset.theme).toBe('dark')
    stop()
    expect(listeners.size).toBe(0)

    applyTheme(host, 'dark', win)
    expect(host.dataset.theme).toBe('dark')
    expect(listeners.size).toBe(0)
  })

  it('works without matchMedia', () => {
    const host = document.createElement('div')
    applyTheme(host, 'system', {} as Window)
    expect(host.dataset.theme).toBe('dark')
  })
})
