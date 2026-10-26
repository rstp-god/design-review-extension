export const UI_LANGUAGES = ['en', 'ru'] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]

/** `ru`, `ru-RU` → `ru`; anything else → `en` (spec 3.12: English by default). */
export function resolveLanguage(uiLanguage: string | null | undefined): UiLanguage {
  return (uiLanguage ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
