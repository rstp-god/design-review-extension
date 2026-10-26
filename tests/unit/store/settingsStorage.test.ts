import { makeSettingsEnvelope } from '@tests/fixtures/data'
import { type ChromeMock, installChromeMock } from '@tests/mocks/chrome'
import { beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_KEY } from '@/shared/constants'
import { defaultSettings } from '@/shared/model'
import { readSettings, settingsEnvelopeSchema, toReportLang } from '@/store/settingsStorage'

describe('settingsStorage', () => {
  let mock: ChromeMock

  beforeEach(() => {
    mock = installChromeMock()
  })

  it('maps the UI language to a report language', () => {
    expect(toReportLang('ru')).toBe('ru')
    expect(toReportLang('ru-RU')).toBe('ru')
    expect(toReportLang('en-US')).toBe('en')
    expect(toReportLang('de')).toBe('en')
  })

  it('returns defaults for a missing or unreadable envelope', async () => {
    expect(await readSettings('ru')).toEqual(defaultSettings('ru'))

    await mock.storage.sync.set({ [SETTINGS_KEY]: 'garbage' })
    expect(await readSettings('en')).toEqual(defaultSettings('en'))
  })

  it('reads a stored envelope and repairs invalid fields', async () => {
    const envelope = makeSettingsEnvelope({ sessionScope: 'page', theme: 'light' })
    await mock.storage.sync.set({
      [SETTINGS_KEY]: { ...envelope, state: { ...envelope.state, freezeDelay: 42 } },
    })

    const settings = await readSettings()
    expect(settings.sessionScope).toBe('page')
    expect(settings.theme).toBe('light')
    expect(settings.freezeDelay).toBe(5)
  })

  it('validates the envelope meta', () => {
    expect(settingsEnvelopeSchema.safeParse({ meta: {}, state: {} }).success).toBe(false)
    expect(settingsEnvelopeSchema.safeParse(makeSettingsEnvelope()).success).toBe(true)
  })
})
