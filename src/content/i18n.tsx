import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { createTranslator, type Resources, type Translate } from '@/i18n/lite'
import type { UiLanguage } from '@/i18n/resolveLanguage'
import enCommon from '@/i18n/resources/en/common.json'
import enOverlay from '@/i18n/resources/en/overlay.json'
import ruCommon from '@/i18n/resources/ru/common.json'
import ruOverlay from '@/i18n/resources/ru/overlay.json'

/**
 * Translations of the overlay: the lite translator (i18n/lite.ts) over the `overlay` and
 * `common` namespaces only — nothing of the popup or the settings reaches the page.
 */
export const overlayResources = {
  overlay: { en: enOverlay, ru: ruOverlay } satisfies Resources<typeof enOverlay>,
  common: { en: enCommon, ru: ruCommon } satisfies Resources<typeof enCommon>,
}

export type OverlayNamespace = keyof typeof overlayResources
type KeysOf<NS extends OverlayNamespace> = (typeof overlayResources)[NS]['en']

const LanguageContext = createContext<UiLanguage>('en')

export function OverlayI18nProvider({
  language,
  children,
}: {
  language: UiLanguage
  children: ReactNode
}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>
}

/** `const t = useT('overlay')` → `t('toolbar.picker')`; keys are checked against the English JSON. */
export function useT<NS extends OverlayNamespace>(namespace: NS): Translate<KeysOf<NS>> {
  const language = useContext(LanguageContext)
  return useMemo(
    () => createTranslator(language, overlayResources[namespace] as Resources<KeysOf<NS>>),
    [language, namespace],
  )
}
