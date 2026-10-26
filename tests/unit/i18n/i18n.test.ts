import { describe, expect, it } from 'vitest'
import { createI18n, resolveLanguage } from '@/i18n'

describe('i18n', () => {
  it('resolves the UI language to ru or en', () => {
    expect(resolveLanguage('ru')).toBe('ru')
    expect(resolveLanguage('ru-RU')).toBe('ru')
    expect(resolveLanguage('RU')).toBe('ru')
    expect(resolveLanguage('en-US')).toBe('en')
    expect(resolveLanguage('de')).toBe('en')
    expect(resolveLanguage(undefined)).toBe('en')
  })

  it('creates independent instances per language', () => {
    const en = createI18n('en')
    const ru = createI18n('ru')
    expect(en.t('settings:title')).toBe('Settings')
    expect(ru.t('settings:title')).toBe('Настройки')
    expect(en.language).toBe('en')
  })

  it('pluralizes counts in both languages', () => {
    const en = createI18n('en')
    const ru = createI18n('ru')
    expect(en.t('issues', { count: 1 })).toBe('1 issue')
    expect(en.t('issues', { count: 12 })).toBe('12 issues')
    expect(ru.t('issues', { count: 1 })).toBe('1 замечание')
    expect(ru.t('issues', { count: 3 })).toBe('3 замечания')
    expect(ru.t('issues', { count: 12 })).toBe('12 замечаний')
    expect(ru.t('pages', { count: 21 })).toBe('21 страница')
  })

  it('falls back to English for a missing key', () => {
    const ru = createI18n('ru')
    expect(ru.t('popup:export.html')).toBe('HTML')
  })
})
