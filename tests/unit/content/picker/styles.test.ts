import { describe, expect, it } from 'vitest'
import type { NodeStyles, StyleProp } from '@/content/picker/source'
import {
  REQUIRED_STYLE_PROPS,
  STYLE_PROPS,
  STYLE_PROPS_BY_FIELD,
  stylePropsFor,
} from '@/content/picker/source'
import { contentBox, MISSING_VALUE, type TooltipFormat, tooltipRows } from '@/content/picker/styles'
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
/** Border box of the fixture button. */
const box = { w: 246, h: 40 }

function rowMap(rows: ReturnType<typeof tooltipRows>) {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

describe('tooltipRows', () => {
  it('renders the mockup rows for the fixture button', () => {
    const rows = tooltipRows(buttonStyles(), all, box)
    expect(rowMap(rows)).toEqual({
      font: 'Inter 14px/20px · 600',
      text: 'center',
      color: '#FFFFFF',
      background: '#2563EB',
      padding: '10px 16px',
      margin: '16px 0 0',
      content: '214px × 20px',
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

  it('content is the border box minus padding and borders, whatever box-sizing and width say', () => {
    const bordered = buttonStyles({
      width: 'auto',
      height: 'auto',
      'box-sizing': 'content-box',
      'border-top-width': '1px',
      'border-right-width': '2px',
      'border-bottom-width': '1px',
      'border-left-width': '2px',
    })
    expect(contentBox(bordered.values, { w: 300.46, h: 61.5 })).toEqual({ w: 264.46, h: 39.5 })
    expect(rowMap(tooltipRows(bordered, all, { w: 300.46, h: 61.5 })).content).toBe(
      '264.5px × 39.5px',
    )
    // Never negative: a box smaller than its own padding shows an empty content area.
    expect(rowMap(tooltipRows(bordered, all, { w: 10, h: 10 })).content).toBe('0 × 0')
  })

  it('follows the enabled fields', () => {
    const rows = tooltipRows(buttonStyles(), { ...all, fields: ['colors', 'spacing'] }, box)
    expect(rows.map((row) => row.key)).toEqual(['color', 'background', 'padding', 'margin'])
    expect(tooltipRows(buttonStyles(), { ...all, fields: [] }, box)).toEqual([])
  })

  it('applies the color format and the units', () => {
    const rows = rowMap(
      tooltipRows(buttonStyles(), { ...all, colorFormat: 'hsl', units: 'rem' }, box),
    )
    expect(rows.font).toBe('Inter 0.875rem/1.25rem · 600')
    expect(rows.background).toBe('hsl(221, 83%, 53%)')
    expect(rows.padding).toBe('0.625rem 1rem')
    expect(rows.margin).toBe('1rem 0 0')
    expect(rows.content).toBe('13.375rem × 1.25rem')
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
        box,
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

describe('tooltipRows with a partial capture (snapshot)', () => {
  /** A snapshot that captured only the required properties and the colors group. */
  function partial(): NodeStyles {
    const full = buttonStyles()
    const keep = new Set<string>(stylePropsFor(['colors']))
    const values = Object.fromEntries(
      Object.entries(full.values).filter(([property]) => keep.has(property)),
    ) as NodeStyles['values']
    return { rootFontSize: 16, values }
  }

  it('collapses a field that was not captured to one “—” row and keeps the others', () => {
    const rows = tooltipRows(partial(), all, box)
    expect(rows.map((row) => [row.key, row.value, row.missing ?? false])).toEqual([
      ['font', MISSING_VALUE, true],
      ['radius', MISSING_VALUE, true],
      ['color', '#FFFFFF', false],
      ['background', '#2563EB', false],
      ['padding', '10px 16px', false],
      ['margin', '16px 0 0', false],
      ['content', '214px × 20px', false],
      ['display', 'flex', false],
    ])
  })

  it('needs nothing beyond the required set for spacing and size', () => {
    const rows = tooltipRows(partial(), { ...all, fields: ['spacing', 'size'] }, box)
    expect(rows.every((row) => !row.missing)).toBe(true)
  })

  it('lists the required properties first and each field group once', () => {
    expect(stylePropsFor([])).toEqual([...REQUIRED_STYLE_PROPS])
    expect(stylePropsFor(['colors', 'colors'])).toHaveLength(
      REQUIRED_STYLE_PROPS.length + STYLE_PROPS_BY_FIELD.colors.length,
    )
    expect(new Set(stylePropsFor(TOOLTIP_FIELDS))).toEqual(new Set(STYLE_PROPS))
  })
})
