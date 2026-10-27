import { describe, expect, it } from 'vitest'
import type { NodeStyles, StyleProp } from '@/content/picker/source'
import { STYLE_PROPS } from '@/content/picker/source'
import { type TooltipFormat, tooltipRows } from '@/content/picker/styles'
import { TOOLTIP_FIELDS } from '@/shared/model'

/** The fixture button from screens.md §04 as Chrome would report it. */
function buttonStyles(overrides: Partial<Record<StyleProp, string>> = {}): NodeStyles {
  const values = Object.fromEntries(STYLE_PROPS.map((prop) => [prop, ''])) as Record<
    StyleProp,
    string
  >
  Object.assign(values, {
    'font-family': 'Inter, system-ui, sans-serif',
    'font-size': '14px',
    'font-weight': '600',
    'font-style': 'normal',
    'line-height': '20px',
    'letter-spacing': 'normal',
    'text-align': 'center',
    'text-transform': 'none',
    'text-decoration-line': 'none',
    color: 'rgb(255, 255, 255)',
    'background-color': 'rgb(37, 99, 235)',
    opacity: '1',
    'border-top-width': '0px',
    'border-top-style': 'none',
    'border-top-color': 'rgb(0, 0, 0)',
    'padding-top': '10px',
    'padding-right': '16px',
    'padding-bottom': '10px',
    'padding-left': '16px',
    'margin-top': '16px',
    'margin-right': '0px',
    'margin-bottom': '0px',
    'margin-left': '0px',
    width: '246px',
    height: '40px',
    display: 'flex',
    'box-sizing': 'border-box',
    'border-top-left-radius': '8px',
    'border-top-right-radius': '8px',
    'border-bottom-right-radius': '8px',
    'border-bottom-left-radius': '8px',
    'box-shadow': 'none',
    ...overrides,
  })
  return { rootFontSize: 16, values }
}

const all: TooltipFormat = { fields: TOOLTIP_FIELDS, colorFormat: 'hex', units: 'px' }

function rowMap(rows: ReturnType<typeof tooltipRows>) {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

describe('tooltipRows', () => {
  it('renders the mockup rows for the fixture button', () => {
    const rows = tooltipRows(buttonStyles(), all)
    expect(rowMap(rows)).toEqual({
      font: 'Inter 14px/20px · 600',
      text: 'center',
      color: '#FFFFFF',
      background: '#2563EB',
      padding: '10px 16px',
      margin: '16px 0 0',
      size: '246px × 40px',
      display: 'flex',
      radius: '8px',
    })
    expect(rows.find((row) => row.key === 'color')?.swatch).toBe('rgb(255, 255, 255)')
    expect(rows.map((row) => row.field)).toEqual([
      'typography',
      'typography',
      'colors',
      'colors',
      'spacing',
      'spacing',
      'size',
      'size',
      'radius',
    ])
  })

  it('follows the enabled fields', () => {
    const rows = tooltipRows(buttonStyles(), { ...all, fields: ['colors', 'spacing'] })
    expect(rows.map((row) => row.key)).toEqual(['color', 'background', 'padding', 'margin'])
    expect(tooltipRows(buttonStyles(), { ...all, fields: [] })).toEqual([])
  })

  it('applies the color format and the units', () => {
    const rows = rowMap(tooltipRows(buttonStyles(), { ...all, colorFormat: 'hsl', units: 'rem' }))
    expect(rows.font).toBe('Inter 0.875rem/1.25rem · 600')
    expect(rows.background).toBe('hsl(221, 83%, 53%)')
    expect(rows.padding).toBe('0.625rem 1rem')
    expect(rows.margin).toBe('1rem 0 0')
    expect(rows.size).toBe('15.375rem × 2.5rem')
    expect(rows.radius).toBe('0.5rem')
  })

  it('shows border, shadow, text details and quoted font families only when they matter', () => {
    const rows = rowMap(
      tooltipRows(
        buttonStyles({
          'font-family': '"JetBrains Mono", monospace',
          'font-style': 'italic',
          'text-transform': 'uppercase',
          'text-align': 'start',
          'letter-spacing': '0.5px',
          'text-decoration-line': 'underline',
          'line-height': 'normal',
          'background-color': 'rgba(0, 0, 0, 0)',
          'border-top-width': '1px',
          'border-top-style': 'solid',
          'border-top-color': 'rgb(229, 231, 235)',
          'box-shadow': 'rgba(0, 0, 0, 0.22) 0px 8px 24px 0px',
          'border-top-left-radius': '12px',
          'border-top-right-radius': '12px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px',
        }),
        all,
      ),
    )
    expect(rows.font).toBe('JetBrains Mono 14px/normal · 600')
    expect(rows.text).toBe('italic · uppercase · 0.5px · underline')
    expect(rows.background).toBeUndefined()
    expect(rows.border).toBe('1px solid #E5E7EB')
    expect(rows.shadow).toBe('rgba(0, 0, 0, 0.22) 0 8px 24px 0')
    expect(rows.radius).toBe('12px 12px 0 0')
  })
})
