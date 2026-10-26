import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getUILanguage } from '@/services/chrome/i18n'
import { resolveLanguage, type UiLanguage } from './resolveLanguage'
import enCommon from './resources/en/common.json'
import enOverlay from './resources/en/overlay.json'
import enPopup from './resources/en/popup.json'
import enSettings from './resources/en/settings.json'
import ruCommon from './resources/ru/common.json'
import ruOverlay from './resources/ru/overlay.json'
import ruPopup from './resources/ru/popup.json'
import ruSettings from './resources/ru/settings.json'

export const resources = {
  en: { common: enCommon, popup: enPopup, settings: enSettings, overlay: enOverlay },
  ru: { common: ruCommon, popup: ruPopup, settings: ruSettings, overlay: ruOverlay },
} as const

export const NAMESPACES = ['common', 'popup', 'settings', 'overlay'] as const
export type Namespace = (typeof NAMESPACES)[number]

/**
 * One i18next instance per context (popup, overlay), language from the browser UI
 * (`chrome.i18n.getUILanguage`). The report page will create its own instance with the language
 * from the settings instead.
 */
export function createI18n(language: UiLanguage = resolveLanguage(getUILanguage())): I18n {
  const instance = i18next.createInstance()
  void instance.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: NAMESPACES,
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  return instance
}

export type { UiLanguage } from './resolveLanguage'
export { resolveLanguage } from './resolveLanguage'
