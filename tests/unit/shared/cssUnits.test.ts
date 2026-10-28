import { describe, expect, it } from 'vitest'
import {
  convertLengths,
  formatBoxSize,
  formatLength,
  formatNumber,
  shorthand,
} from '@/shared/cssUnits'

describe('formatNumber', () => {
  it('keeps at most one decimal by default, without trailing zeros or a minus zero', () => {
    expect(formatNumber(108.6)).toBe('108.6')
    expect(formatNumber(45)).toBe('45')
    expect(formatNumber(45.04)).toBe('45')
    expect(formatNumber(68.57)).toBe('68.6')
    expect(formatNumber(0.04)).toBe('0')
    expect(formatNumber(-0.04)).toBe('0')
    expect(formatNumber(-12.26)).toBe('-12.3')
  })

  it('takes the number of decimals', () => {
    expect(formatNumber(0.8125, 3)).toBe('0.813')
    expect(formatNumber(0.8, 3)).toBe('0.8')
    expect(formatNumber(1.5, 0)).toBe('2')
  })
})

describe('formatLength', () => {
  it('keeps px tidy with one decimal at most', () => {
    expect(formatLength(16, 'px', 16)).toBe('16px')
    expect(formatLength(10.5, 'px', 16)).toBe('10.5px')
    expect(formatLength(68.57, 'px', 16)).toBe('68.6px')
    expect(formatLength(45.04, 'px', 16)).toBe('45px')
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
    expect(formatBoxSize(108.57, 45)).toBe('108.6 × 45')
  })
})
