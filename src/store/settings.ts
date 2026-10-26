import { create } from 'zustand'
import { resolveLanguage } from '@/i18n/resolveLanguage'
import { getUILanguage } from '@/services/chrome/i18n'
import { SETTINGS_KEY } from '@/shared/constants'
import { defaultSettings, type Settings, type TooltipField } from '@/shared/model'
import { settingsSchema } from '@/shared/schemas'
import { settingsEnvelopeSchema } from './settingsStorage'
import { type Synced, withChromeSync } from './withChromeSync'

export interface SettingsActions {
  update: (patch: Partial<Settings>) => void
  toggleTooltipField: (field: TooltipField, enabled: boolean) => void
}

export type SettingsStore = Settings & SettingsActions

const SETTINGS_KEYS = Object.keys(settingsSchema.shape) as Array<keyof Settings>

/** The persisted slice: only the settings fields, never the actions or the sync flags. */
export function pickSettings(state: Settings): Settings {
  return Object.fromEntries(SETTINGS_KEYS.map((key) => [key, state[key]])) as unknown as Settings
}

/**
 * Settings (spec 3.10) shared by the popup and the overlay through `chrome.storage.sync`.
 * Saving is immediate (debounced 150 ms); there is no Save button.
 */
export const useSettingsStore = create<Synced<SettingsStore>>()(
  withChromeSync<SettingsStore, Settings>({
    key: SETTINGS_KEY,
    area: 'sync',
    schema: settingsEnvelopeSchema,
    partialize: pickSettings,
    debounceMs: 150,
  })((set) => ({
    ...defaultSettings(resolveLanguage(getUILanguage())),
    update: (patch) => set(patch),
    toggleTooltipField: (field, enabled) =>
      set((state) => {
        const without = state.tooltipFields.filter((candidate) => candidate !== field)
        return { tooltipFields: enabled ? [...without, field] : without }
      }),
  })),
)
