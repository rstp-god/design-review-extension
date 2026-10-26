import { describe, expect, it } from 'vitest'
import {
  displayHost,
  formatBytes,
  formatRelativeDay,
  sessionLabel,
  splitShortcut,
} from '@/shared/format'

describe('formatBytes', () => {
  it('picks the unit by magnitude', () => {
    expect(formatBytes(0, 'en')).toBe('0 byte')
    expect(formatBytes(512, 'en')).toBe('512 byte')
    expect(formatBytes(2048, 'en')).toBe('2 kB')
    expect(formatBytes(13_002_342, 'en')).toBe('12.4 MB')
    expect(formatBytes(3 * 1024 ** 3, 'en')).toBe('3 GB')
  })

  it('localizes the number and the unit', () => {
    expect(formatBytes(13_002_342, 'ru')).toBe('12,4 МБ')
  })

  it('treats garbage as zero', () => {
    expect(formatBytes(Number.NaN, 'en')).toBe('0 byte')
    expect(formatBytes(-5, 'en')).toBe('0 byte')
  })
})

describe('formatRelativeDay', () => {
  const now = new Date(2026, 9, 26, 15, 0, 0)

  it('says today and yesterday', () => {
    expect(formatRelativeDay(new Date(2026, 9, 26, 1, 0).toISOString(), now, 'en')).toBe('today')
    expect(formatRelativeDay(new Date(2026, 9, 25, 23, 59).toISOString(), now, 'en')).toBe(
      'yesterday',
    )
    expect(formatRelativeDay(new Date(2026, 9, 25, 23, 59).toISOString(), now, 'ru')).toBe('вчера')
  })

  it('shows day and month within the year, and the year otherwise', () => {
    expect(formatRelativeDay(new Date(2026, 9, 21).toISOString(), now, 'en')).toBe('Oct 21')
    expect(formatRelativeDay(new Date(2025, 11, 3).toISOString(), now, 'en')).toBe('Dec 3, 2025')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatRelativeDay('nope', now, 'en')).toBe('')
  })
})

describe('splitShortcut', () => {
  it('splits plus-separated shortcuts', () => {
    expect(splitShortcut('Alt+Shift+R')).toEqual(['Alt', 'Shift', 'R'])
    expect(splitShortcut(' Ctrl + Y ')).toEqual(['Ctrl', 'Y'])
  })

  it('splits macOS glyph shortcuts per character', () => {
    expect(splitShortcut('⌥⇧R')).toEqual(['⌥', '⇧', 'R'])
  })

  it('returns nothing for an unbound command', () => {
    expect(splitShortcut('')).toEqual([])
    expect(splitShortcut('   ')).toEqual([])
  })
})

describe('displayHost / sessionLabel', () => {
  it('shows host with port and without scheme', () => {
    expect(displayHost('https://shop.example.ru')).toBe('shop.example.ru')
    expect(displayHost('http://localhost:5173')).toBe('localhost:5173')
    expect(displayHost('garbage')).toBe('garbage')
  })

  it('appends the path for page sessions only', () => {
    expect(sessionLabel({ scope: 'domain', origin: 'https://shop.example.ru' })).toBe(
      'shop.example.ru',
    )
    expect(
      sessionLabel({ scope: 'page', origin: 'https://landing.example.ru', path: '/promo' }),
    ).toBe('landing.example.ru/promo')
    expect(sessionLabel({ scope: 'page', origin: 'https://landing.example.ru', path: '/' })).toBe(
      'landing.example.ru',
    )
  })
})
