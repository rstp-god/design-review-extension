import { describe, expect, it } from 'vitest'
import { APP_NAME } from '@/shared/constants'

describe('toolchain smoke', () => {
  it('runs a test and resolves the @/ alias', () => {
    expect(APP_NAME).toBe('Design Review')
  })
})
