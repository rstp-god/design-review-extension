import { formatCssColor, isTransparent } from '@/shared/colorFormat'
import { convertLengths, formatLength, shorthand } from '@/shared/cssUnits'
import type { ColorFormat, TooltipField, Units } from '@/shared/model'
import type { NodeStyles, StyleProp } from './source'

export type TooltipRowKey =
  | 'font'
  | 'text'
  | 'color'
  | 'background'
  | 'border'
  | 'padding'
  | 'margin'
  | 'size'
  | 'display'
  | 'radius'
  | 'shadow'

export interface TooltipRow {
  key: TooltipRowKey
  field: TooltipField
  value: string
  /** CSS color for a swatch next to the value. */
  swatch?: string
}

export interface TooltipFormat {
  fields: readonly TooltipField[]
  colorFormat: ColorFormat
  units: Units
}

/** `"Inter", system-ui` → `Inter`. */
function firstFontFamily(value: string): string {
  const first = value.split(',')[0] ?? value
  return first.trim().replace(/^["']|["']$/g, '')
}

/**
 * Turns captured computed values into the rows of the picker tooltip (screens.md §04), by the
 * fields enabled in the settings. Pure: the source captured raw values once, the user's color
 * format and units are applied here on every render, so a settings change needs no re-capture.
 */
export function tooltipRows(
  styles: NodeStyles,
  format: TooltipFormat,
  /** Border box of the node: computed `width` / `height` are `auto` for inline elements. */
  box?: { w: number; h: number },
): TooltipRow[] {
  const { values, rootFontSize } = styles
  const { colorFormat, units } = format
  const enabled = new Set(format.fields)
  const rows: TooltipRow[] = []
  const get = (property: StyleProp) => values[property] ?? ''
  const length = (property: StyleProp) => convertLengths(get(property), units, rootFontSize)
  const px = (property: StyleProp) => Number.parseFloat(get(property)) || 0

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
    const side = (property: 'width' | 'height', fallback: number | undefined) => {
      const value = Number.parseFloat(get(property))
      return formatLength(Number.isFinite(value) ? value : (fallback ?? 0), units, rootFontSize)
    }
    rows.push({
      key: 'size',
      field: 'size',
      value: `${side('width', box?.w)} × ${side('height', box?.h)}`,
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
