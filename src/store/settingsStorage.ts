import { z } from 'zod'
import { getArea } from '@/services/chrome/storage'
import { SETTINGS_KEY } from '@/shared/constants'
import { defaultSettings, type ReportLang, type Settings } from '@/shared/model'
import { settingsSchema } from '@/shared/schemas'

/**
 * Envelope every synced store keeps in `chrome.storage`: `rev` orders concurrent writers,
 * `originId` lets a context ignore its own change events (see store/withChromeSync.ts).
 */
export const envelopeMetaSchema = z.object({
  originId: z.string(),
  rev: z.number(),
  ts: z.number(),
})

export function makeEnvelopeSchema<State extends z.ZodType>(state: State) {
  return z.object({ meta: envelopeMetaSchema, state })
}

export const settingsEnvelopeSchema = makeEnvelopeSchema(settingsSchema)
export type SettingsEnvelope = z.infer<typeof settingsEnvelopeSchema>

/** `ru*` → `ru`, everything else → `en` (the two UI languages). */
export function toReportLang(uiLanguage: string): ReportLang {
  return uiLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

/**
 * One-shot read for contexts without a store (the service worker). Missing or unreadable
 * envelope → defaults; a partially invalid one → per-field defaults (settingsSchema).
 */
export async function readSettings(uiLanguage = 'en'): Promise<Settings> {
  const raw = await getArea<unknown>('sync', SETTINGS_KEY)
  const parsed = settingsEnvelopeSchema.safeParse(raw)
  return parsed.success ? parsed.data.state : defaultSettings(toReportLang(uiLanguage))
}
