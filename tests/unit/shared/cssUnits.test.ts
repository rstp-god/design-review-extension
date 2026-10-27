import { describe, expect, it } from 'vitest'
import { convertLengths, formatBoxSize, formatLength, shorthand } from '@/shared/cssUnits'

describe('formatLength', () => {
  it('keeps px tidy', () => {
    expect(formatLength(16, 'px', 16)).toBe('16px')
    expect(formatLength(10.5, 'px', 16)).toBe('10.5px')
    expect(formatLength(0.004, 'px', 16)).toBe('0px')
    expect(formatLength(0, 'px', 16)).toBe('0')
    expect(formatLength(-0.001, 'px', 16)).toBe('0px')
  })

  it('converts to rem with the real root font size', () => {
    expect(formatLength(16, 'rem', 16)).toBe('1rem')
    expect(formatLength(16, 'rem', 10)).toBe('1.6rem')
    expect(formatLength(13, 'rem', 16)).toBe('0.813rem')
    expect(formatLength(-8, 'rem', 16)).toBe('-0.5rem')
    expect(formatLength(16, 'rem', 0)).toBe('1rem')
  })
})

describe('convertLengths', () => {
  it('rewrites every px value inside a computed value', () => {
    expect(convertLengths('10px 16px', 'rem', 10)).toBe('1rem 1.6rem')
    expect(convertLengths('0px 8px 24px rgba(0, 0, 0, 0.22)', 'px', 16)).toBe(
      '0 8px 24px rgba(0, 0, 0, 0.22)',
    )
    expect(convertLengths('normal', 'rem', 16)).toBe('normal')
    expect(convertLengths('-0.5px', 'px', 16)).toBe('-0.5px')
  })
})

describe('shorthand', () => {
  it('collapses four sides like CSS does', () => {
    expect(shorthand('8px', '8px', '8px', '8px')).toBe('8px')
    expect(shorthand('10px', '16px', '10px', '16px')).toBe('10px 16px')
    expect(shorthand('16px', '0', '0', '0')).toBe('16px 0 0')
    expect(shorthand('1px', '2px', '3px', '4px')).toBe('1px 2px 3px 4px')
  })
})

describe('formatBoxSize', () => {
  it('shows whole pixels, one decimal otherwise', () => {
    expect(formatBoxSize(246, 40)).toBe('246 × 40')
    expect(formatBoxSize(246.4, 40.04)).toBe('246.4 × 40')
  })
})
