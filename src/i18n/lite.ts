import type { UiLanguage } from './resolveLanguage'

/**
 * The content script's translator: the same JSON resources and key conventions as i18next —
 * dot paths, `{{name}}` interpolation, `_one` / `_few` / `_many` / `_other` plural suffixes,
 * English fallback — without i18next. It and react-i18next weighed 49 kB in the overlay bundle
 * for a handful of `t('key')` calls. Plural categories come from `Intl.PluralRules`, which is
 * what i18next uses too; a parity test keeps both in step. The popup and the report page keep
 * i18next (`./index.ts`).
 */

export type ResourceTree = { readonly [key: string]: string | ResourceTree }

type PluralSuffix = '_zero' | '_one' | '_two' | '_few' | '_many' | '_other'
type StripPlural<K extends string> = K extends `${infer Base}${PluralSuffix}` ? Base : K

/**
 * `toolbar.picker`, `hint.exit`, `issues` (the base of `issues_one` / `issues_other`). Any
 * string for a tree that is not a concrete JSON type (tests build resources at runtime).
 */
export type KeyOf<T extends ResourceTree> = string extends keyof T
  ? string
  : {
      [K in keyof T & string]: T[K] extends string
        ? StripPlural<K>
        : T[K] extends ResourceTree
          ? `${K}.${KeyOf<T[K]>}`
          : never
    }[keyof T & string]

export interface TranslateOptions {
  /** Picks the plural form; also available as `{{count}}`. */
  count?: number
  [name: string]: string | number | undefined
}

export type Translate<T extends ResourceTree> = (
  key: KeyOf<T>,
  options?: TranslateOptions,
) => string

/** English defines the key set; other languages may add plural forms of the same keys. */
export type Resources<T extends ResourceTree> = { en: T } & Record<UiLanguage, ResourceTree>

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g

function lookup(tree: ResourceTree, path: string): string | undefined {
  let node: string | ResourceTree | undefined = tree
  for (const part of path.split('.')) {
    if (typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

const pluralRules = new Map<string, Intl.PluralRules>()

function pluralCategory(language: string, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(language)
    pluralRules.set(language, rules)
  }
  return rules.select(count)
}

function resolve(
  tree: ResourceTree,
  language: string,
  key: string,
  count: number | undefined,
): string | undefined {
  if (count === undefined) return lookup(tree, key)
  return (
    lookup(tree, `${key}_${pluralCategory(language, count)}`) ??
    lookup(tree, `${key}_other`) ??
    lookup(tree, key)
  )
}

/** `{{count}} issues` → `3 issues`; a placeholder without a value stays as it is, like i18next. */
export function interpolate(template: string, options: TranslateOptions): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = options[name]
    return value === undefined ? match : String(value)
  })
}

export function createTranslator<T extends ResourceTree>(
  language: UiLanguage,
  resources: Resources<T>,
): Translate<T> {
  return (key, options = {}) => {
    const text =
      resolve(resources[language], language, key, options.count) ??
      resolve(resources.en, 'en', key, options.count) ??
      key
    return interpolate(text, options)
  }
}
