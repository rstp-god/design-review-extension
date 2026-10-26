import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@/shared/model'
import { settingsSchema, toolbarStateSchema } from '@/shared/schemas'

describe('settingsSchema', () => {
  it('fills every missing field with its default', () => {
    expect(settingsSchema.parse({})).toEqual(defaultSettings('en'))
  })

  it('replaces only the invalid fields and keeps the rest', () => {
    const parsed = settingsSchema.parse({
      sessionScope: 'page',
      reviewer: 'Anna, QA',
      cropPadding: 17,
      freezeDelay: 'soon',
      theme: 'dark',
      tooltipFields: ['typography', 'nope'],
    })
    expect(parsed.sessionScope).toBe('page')
    expect(parsed.reviewer).toBe('Anna, QA')
    expect(parsed.theme).toBe('dark')
    expect(parsed.cropPadding).toBe(24)
    expect(parsed.freezeDelay).toBe(5)
    expect(parsed.tooltipFields).toEqual(['typography', 'colors', 'spacing', 'size'])
  })

  it('drops unknown keys', () => {
    expect(settingsSchema.parse({ legacy: true })).not.toHaveProperty('legacy')
  })
})

describe('toolbarStateSchema', () => {
  it('accepts a position and defaults collapsed to false', () => {
    expect(toolbarStateSchema.parse({ x: 10, y: 20 })).toEqual({ x: 10, y: 20, collapsed: false })
  })

  it('rejects a non-finite position', () => {
    expect(toolbarStateSchema.safeParse({ x: Number.NaN, y: 0 }).success).toBe(false)
    expect(toolbarStateSchema.safeParse({ x: 0 }).success).toBe(false)
  })
})

describe('defaultSettings', () => {
  it('uses the UI language for the report', () => {
    expect(defaultSettings('ru').reportLang).toBe('ru')
    expect(defaultSettings().reportLang).toBe('en')
  })
})
