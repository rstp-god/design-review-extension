import { describe, expect, it } from 'vitest'
import { createI18n, resources } from '@/i18n'
import { createTranslator, interpolate, type Resources, type ResourceTree } from '@/i18n/lite'

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const COUNTS = [0, 1, 2, 3, 5, 11, 12, 21, 22, 25, 101, 111]

/** Leaf keys of a tree; plural forms collapse to their base key, flagged as plural. */
function leafKeys(tree: ResourceTree, prefix = ''): Array<{ key: string; plural: boolean }> {
  const found = new Map<string, boolean>()
  for (const [name, value] of Object.entries(tree)) {
    const path = `${prefix}${prefix ? '.' : ''}${name}`
    if (typeof value === 'string') {
      const plural = PLURAL_SUFFIX.test(name)
      found.set(plural ? path.replace(PLURAL_SUFFIX, '') : path, plural)
    } else {
      for (const leaf of leafKeys(value, path)) found.set(leaf.key, leaf.plural)
    }
  }
  return [...found].map(([key, plural]) => ({ key, plural }))
}

/** i18next's `t`, untyped: the keys come from the JSON files at runtime here. */
function i18nextT(language: 'en' | 'ru') {
  const instance = createI18n(language)
  return (key: string, options?: { count: number }) =>
    (instance.t as (key: string, options?: { count: number }) => string)(key, options)
}

const namespaces = ['overlay', 'common'] as const

describe('lite translator', () => {
  it.each(['en', 'ru'] as const)(
    'returns what i18next returns for every overlay and common key in %s',
    (language) => {
      const reference = i18nextT(language)
      for (const namespace of namespaces) {
        const t = createTranslator<ResourceTree>(language, {
          en: resources.en[namespace],
          ru: resources.ru[namespace],
        })
        for (const { key, plural } of leafKeys(resources.en[namespace])) {
          if (plural) {
            for (const count of COUNTS) {
              expect(t(key, { count }), `${namespace}:${key} × ${count}`).toBe(
                reference(`${namespace}:${key}`, { count }),
              )
            }
          } else {
            expect(t(key), `${namespace}:${key}`).toBe(reference(`${namespace}:${key}`))
          }
        }
      }
    },
  )

  it('falls back to English, then to the key itself', () => {
    const tree = {
      en: { a: { b: 'B' }, only: 'only in English', items_one: 'item', items_other: 'items' },
      ru: { a: { b: 'Б' } },
    } satisfies Resources<ResourceTree>
    const ru = createTranslator<ResourceTree>('ru', tree)
    expect(ru('a.b')).toBe('Б')
    expect(ru('only')).toBe('only in English')
    expect(ru('items', { count: 3 })).toBe('items')
    expect(ru('missing.key')).toBe('missing.key')
    expect(ru('a')).toBe('a')
  })

  it('interpolates values and leaves unknown placeholders alone', () => {
    expect(interpolate('{{count}} of {{ total }} · {{name}}', { count: 2, total: 5 })).toBe(
      '2 of 5 · {{name}}',
    )
  })
})
