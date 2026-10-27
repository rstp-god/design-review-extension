import { describe, expect, it } from 'vitest'
import { formatColor, formatCssColor, isTransparent, parseCssColor } from '@/shared/colorFormat'

describe('parseCssColor', () => {
  it('parses what getComputedStyle returns', () => {
    expect(parseCssColor('rgb(37, 99, 235)')).toEqual({ r: 37, g: 99, b: 235, a: 1 })
    expect(parseCssColor('rgba(37, 99, 235, 0.5)')).toEqual({ r: 37, g: 99, b: 235, a: 0.5 })
    expect(parseCssColor('rgb(37 99 235 / 50%)')).toEqual({ r: 37, g: 99, b: 235, a: 0.5 })
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('parses hex too', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseCssColor('#2563EB')).toEqual({ r: 37, g: 99, b: 235, a: 1 })
    expect(parseCssColor('#2563EB80')).toEqual({ r: 37, g: 99, b: 235, a: 128 / 255 })
    expect(parseCssColor('#12345')).toBeNull()
  })

  it('rejects everything else', () => {
    expect(parseCssColor('color(display-p3 1 0 0)')).toBeNull()
    expect(parseCssColor('rgb(1, 2)')).toBeNull()
    expect(parseCssColor('rgb(a, b, c)')).toBeNull()
    expect(parseCssColor('')).toBeNull()
  })

  it('knows transparent colors', () => {
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true)
    expect(isTransparent('transparent')).toBe(true)
    expect(isTransparent('rgb(255, 255, 255)')).toBe(false)
    expect(isTransparent('lab(50% 0 0)')).toBe(false)
  })
})

describe('formatColor', () => {
  const blue = { r: 37, g: 99, b: 235, a: 1 }
  const half = { ...blue, a: 0.5 }

  it('formats hex, rgb and hsl', () => {
    expect(formatColor(blue, 'hex')).toBe('#2563EB')
    expect(formatColor(blue, 'rgb')).toBe('rgb(37, 99, 235)')
    expect(formatColor(blue, 'hsl')).toBe('hsl(221, 83%, 53%)')
  })

  it('keeps the alpha channel', () => {
    expect(formatColor(half, 'hex')).toBe('#2563EB80')
    expect(formatColor(half, 'rgb')).toBe('rgba(37, 99, 235, 0.5)')
    expect(formatColor(half, 'hsl')).toBe('hsla(221, 83%, 53%, 0.5)')
  })

  it('handles greys and the hue wrap-around', () => {
    expect(formatColor({ r: 128, g: 128, b: 128, a: 1 }, 'hsl')).toBe('hsl(0, 0%, 50%)')
    expect(formatColor({ r: 255, g: 0, b: 128, a: 1 }, 'hsl')).toBe('hsl(330, 100%, 50%)')
    expect(formatColor({ r: 0, g: 255, b: 0, a: 1 }, 'hsl')).toBe('hsl(120, 100%, 50%)')
    expect(formatColor({ r: 0, g: 0, b: 255, a: 1 }, 'hsl')).toBe('hsl(240, 100%, 50%)')
  })

  it('passes unparseable values through', () => {
    expect(formatCssColor('rgb(255, 255, 255)', 'hex')).toBe('#FFFFFF')
    expect(formatCssColor('color(display-p3 1 0 0)', 'hex')).toBe('color(display-p3 1 0 0)')
  })
})
