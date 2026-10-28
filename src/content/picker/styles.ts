import { formatCssColor, isTransparent } from '@/shared/colorFormat'
import { convertLengths, formatLength, shorthand } from '@/shared/cssUnits'
import type { ColorFormat, TooltipField, Units } from '@/shared/model'
import { type NodeStyles, STYLE_PROPS_BY_FIELD, type StyleProp } from './source'

/** Shown for a field whose properties the source did not capture (a snapshot taken earlier). */
export const MISSING_VALUE = '—'

export type TooltipRowKey =
  | 'font'
  | 'text'
  | 'color'
  | 'background'
  | 'border'
  | 'padding'
  | 'margin'
  | 'content'
  | 'display'
  | 'radius'
  | 'shadow'

export interface TooltipRow {
  key: TooltipRowKey
  field: TooltipField
  value: string
  /** CSS color for a swatch next to the value. */
  swatch?: string
  /** The source has no values for this field: `value` is `MISSING_VALUE`. */
  missing?: boolean
}

/** The one row a field collapses to when its properties were not captured. */
const MISSING_ROW_KEY: Record<TooltipField, TooltipRowKey> = {
  typography: 'font',
  colors: 'color',
  spacing: 'padding',
  size: 'content',
  radius: 'radius',
}

export interface TooltipFormat {
  fields: readonly TooltipField[]
  colorFormat: ColorFormat
  units: Units
}

/** Border box of the node in px: the header's `W × H` and the base of the content row. */
export interface BoxSize {
  w: number
  h: number
}

/** `"Inter", system-ui` → `Inter`. */
function firstFontFamily(value: string): string {
  const first = value.split(',')[0] ?? value
  return first.trim().replace(/^["']|["']$/g, '')
}

/**
 * Content box from the border box: padding and borders off each side. Computed `width` and
 * `height` would not do — under `box-sizing: border-box` they are the border box, and for
 * inline elements they are `auto`.
 */
export function contentBox(values: Partial<Record<StyleProp, string>>, box: BoxSize): BoxSize {
  const px = (property: StyleProp) => Number.parseFloat(values[property] ?? '') || 0
  const horizontal =
    px('padding-left') + px('padding-right') + px('border-left-width') + px('border-right-width')
  const vertical =
    px('padding-top') + px('padding-bottom') + px('border-top-width') + px('border-bottom-width')
  return { w: Math.max(0, box.w - horizontal), h: Math.max(0, box.h - vertical) }
}

/**
 * Turns captured computed values into the rows of the picker tooltip (screens.md §04), by the
 * fields enabled in the settings. Pure: the source captured raw values once, the user's color
 * format and units are applied here on every render, so a settings change needs no re-capture.
 * A field whose properties are absent from `values` (enabled after a snapshot was taken) becomes
 * one `—` row flagged `missing`.
 */
export function tooltipRows(styles: NodeStyles, format: TooltipFormat, box: BoxSize): TooltipRow[] {
  const { values, rootFontSize } = styles
  const { colorFormat, units } = format
  const rows: TooltipRow[] = []
  const get = (property: StyleProp) => values[property] ?? ''
  const length = (property: StyleProp) => convertLengths(get(property), units, rootFontSize)
  const px = (property: StyleProp) => Number.parseFloat(get(property)) || 0

  const enabled = new Set<TooltipField>()
  for (const field of format.fields) {
    const captured = STYLE_PROPS_BY_FIELD[field].every((property) => values[property] !== undefined)
    if (captured) enabled.add(field)
    else rows.push({ key: MISSING_ROW_KEY[field], field, value: MISSING_VALUE, missing: true })
  }

  if (enabled.has('typography')) {
    const lineHeight = get('line-height')
    const line = lineHeight === 'normal' || lineHeight === '' ? lineHeight : length('line-height')
    rows.push({
      key: 'font',
      field: 'typography',
      value: `${firstFontFamily(get('font-family'))} ${length('font-size')}/${line} · ${get('font-weight')}`,
    })
    const text = [
      get('font-style') !== 'normal' && get('font-style'),
      get('text-transform') !== 'none' && get('text-transform'),
      !['start', 'left', ''].includes(get('text-align')) && get('text-align'),
      get('letter-spacing') !== 'normal' && length('letter-spacing'),
      get('text-decoration-line') !== 'none' && get('text-decoration-line'),
    ].filter((part): part is string => Boolean(part))
    if (text.length > 0) rows.push({ key: 'text', field: 'typography', value: text.join(' · ') })
  }

  if (enabled.has('colors')) {
    rows.push({
      key: 'color',
      field: 'colors',
      value: formatCssColor(get('color'), colorFormat),
      swatch: get('color'),
    })
    if (!isTransparent(get('background-color'))) {
      rows.push({
        key: 'background',
        field: 'colors',
        value: formatCssColor(get('background-color'), colorFormat),
        swatch: get('background-color'),
      })
    }
    if (px('border-top-width') > 0 && get('border-top-style') !== 'none') {
      rows.push({
        key: 'border',
        field: 'colors',
        value: `${length('border-top-width')} ${get('border-top-style')} ${formatCssColor(get('border-top-color'), colorFormat)}`,
        swatch: get('border-top-color'),
      })
    }
  }

  if (enabled.has('spacing')) {
    rows.push({
      key: 'padding',
      field: 'spacing',
      value: shorthand(
        length('padding-top'),
        length('padding-right'),
        length('padding-bottom'),
        length('padding-left'),
      ),
    })
    rows.push({
      key: 'margin',
      field: 'spacing',
      value: shorthand(
        length('margin-top'),
        length('margin-right'),
        length('margin-bottom'),
        length('margin-left'),
      ),
    })
  }

  if (enabled.has('size')) {
    const content = contentBox(values, box)
    rows.push({
      key: 'content',
      field: 'size',
      value: `${formatLength(content.w, units, rootFontSize)} × ${formatLength(content.h, units, rootFontSize)}`,
    })
    rows.push({ key: 'display', field: 'size', value: get('display') })
  }

  if (enabled.has('radius')) {
    rows.push({
      key: 'radius',
      field: 'radius',
      value: shorthand(
        length('border-top-left-radius'),
        length('border-top-right-radius'),
        length('border-bottom-right-radius'),
        length('border-bottom-left-radius'),
      ),
    })
    if (get('box-shadow') !== 'none' && get('box-shadow') !== '') {
      rows.push({ key: 'shadow', field: 'radius', value: length('box-shadow') })
    }
  }

  return rows
}
