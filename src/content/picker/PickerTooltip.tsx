import {
  arrow,
  FloatingArrow,
  FloatingPortal,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react'
import { TestId, testIds } from '@tests/constants/testIds'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatBoxSize } from '@/shared/cssUnits'
import type { Rect } from '@/shared/model'
import { useSettingsStore } from '@/store/settings'
import { useFloatingRoot } from '@/ui'
import type { NodeStyles, PathEntry } from './source'
import { tooltipRows } from './styles'

export const TOOLTIP_WIDTH = 290
const ARROW_WIDTH = 14
const ARROW_HEIGHT = 7

export interface PickerTooltipProps {
  rect: Rect
  entry: PathEntry
  styles: NodeStyles
}

/** `#id.class.class` after the tag; empty for a bare tag. */
export function entrySuffix(entry: PathEntry): string {
  return `${entry.id ? `#${entry.id}` : ''}${entry.classes.map((name) => `.${name}`).join('')}`
}

/**
 * Hover tooltip of the picker (screens.md §04): `tag.class` and `W × H`, then one row per enabled
 * field. Anchored to the node's rect through a virtual element, flips above the node and shifts
 * to stay in the viewport. `pointer-events: none` keeps it out of hit testing.
 */
export function PickerTooltip({ rect, entry, styles }: PickerTooltipProps) {
  const { t } = useTranslation('overlay')
  const root = useFloatingRoot()
  const fields = useSettingsStore((state) => state.tooltipFields)
  const colorFormat = useSettingsStore((state) => state.colorFormat)
  const units = useSettingsStore((state) => state.units)
  const arrowRef = useRef<SVGSVGElement>(null)

  const reference = useMemo(
    () => ({
      getBoundingClientRect: () => ({
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
        top: rect.y,
        left: rect.x,
        right: rect.x + rect.w,
        bottom: rect.y + rect.h,
      }),
    }),
    [rect.x, rect.y, rect.w, rect.h],
  )

  const { refs, floatingStyles, context } = useFloating({
    open: true,
    placement: 'bottom-start',
    middleware: [
      offset(ARROW_HEIGHT + 3),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef, padding: 12 }),
    ],
  })

  // A virtual element (not `elements.reference`, which must be an `Element`): the node itself
  // may live in another tree, and the snapshot source has no elements at all.
  useLayoutEffect(() => {
    refs.setPositionReference(reference)
  }, [refs, reference])

  const rows = useMemo(
    () => tooltipRows(styles, { fields, colorFormat, units }),
    [styles, fields, colorFormat, units],
  )

  return (
    <FloatingPortal root={root}>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, width: TOOLTIP_WIDTH }}
        role="status"
        aria-label={t('picker.tooltip')}
        data-testid={TestId.PickerTooltip}
        className="pointer-events-none z-20 flex flex-col gap-3 rounded-lg bg-bg px-6 py-5 text-fg shadow-popover"
      >
        <FloatingArrow
          ref={arrowRef}
          context={context}
          width={ARROW_WIDTH}
          height={ARROW_HEIGHT}
          className="fill-bg"
        />
        <div className="flex items-baseline justify-between gap-4 border-border border-b pb-3 font-mono text-sm">
          <span data-testid={TestId.PickerTooltipTag} className="truncate">
            <span className="text-tooltip-tag">{entry.tag}</span>
            <span className="text-tooltip-class">{entrySuffix(entry)}</span>
          </span>
          <span data-testid={TestId.PickerTooltipSize} className="shrink-0 text-fg-secondary">
            {formatBoxSize(rect.w, rect.h)}
          </span>
        </div>
        {rows.length > 0 && (
          <dl className="m-0 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-[5px]">
            {rows.map((row) => (
              <div key={row.key} className="contents" data-testid={testIds.pickerRow(row.key)}>
                <dt className="font-sans text-fg-muted text-sm">{t(`picker.row.${row.key}`)}</dt>
                <dd className="m-0 flex min-w-0 items-center gap-3 font-mono text-label">
                  {row.swatch && (
                    <span
                      aria-hidden="true"
                      className="size-5 shrink-0 rounded-[2px] border border-fg-subtle"
                      style={{ background: row.swatch }}
                    />
                  )}
                  <span className="truncate">{row.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </FloatingPortal>
  )
}
