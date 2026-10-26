import 'i18next'
import type { resources } from './index'

/** Typed keys for `t()` / `useTranslation()`: the English resources define the key set. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['en']
    returnNull: false
  }
}
