import { describe, expect, it } from 'vitest'
import { NAMESPACES, resources } from '@/i18n'

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/** Flattens nested keys; plural forms collapse to one key since RU has more forms than EN. */
function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => {
    const name = `${prefix}${prefix ? '.' : ''}${key.replace(PLURAL_SUFFIX, '_plural')}`
    return keysOf(child, name)
  })
}

function uniqueSorted(keys: string[]): string[] {
  return [...new Set(keys)].sort()
}

/** Spec 3.12: the RU and EN key sets must match in every namespace. */
describe('contract: i18n resources', () => {
  it.each(NAMESPACES)('namespace "%s" has the same keys in en and ru', (namespace) => {
    const en = uniqueSorted(keysOf(resources.en[namespace]))
    const ru = uniqueSorted(keysOf(resources.ru[namespace]))
    expect(ru).toEqual(en)
  })

  it('every string is non-empty', () => {
    for (const language of ['en', 'ru'] as const) {
      for (const namespace of NAMESPACES) {
        const empty = keysOf(resources[language][namespace]).filter((key) => {
          const value = key.split('.').reduce<unknown>((node, part) => {
            if (typeof node !== 'object' || node === null) return undefined
            const record = node as Record<string, unknown>
            // Plural keys were collapsed; find any form that exists.
            if (part.endsWith('_plural')) {
              const stem = part.slice(0, -'_plural'.length)
              const form = Object.keys(record).find((candidate) => candidate.startsWith(`${stem}_`))
              return form ? record[form] : undefined
            }
            return record[part]
          }, resources[language][namespace])
          return typeof value !== 'string' || value.trim() === ''
        })
        expect(empty, `${language}/${namespace}`).toEqual([])
      }
    }
  })
})
