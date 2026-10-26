import { getChrome } from './runtime'

/** Browser UI language (`ru`, `en-US`, …); `en` when the API is unavailable. */
export function getUILanguage(): string {
  try {
    return getChrome()?.i18n?.getUILanguage?.() || 'en'
  } catch {
    return 'en'
  }
}
