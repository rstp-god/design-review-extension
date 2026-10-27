import { TestId } from '@tests/constants/testIds'
import { useT } from '@/content/i18n'
import { Chip, chipTop } from '@/content/overlay/Chip'
import { formatBoxSize } from '@/shared/cssUnits'
import type { Rect } from '@/shared/model'
import type { NodeStyles } from './source'

/** The frame sits outside the node, like the mockup's `inset: -3px` with a 2 px border. */
const FRAME_INSET = 3

export interface LockedFrameProps {
  rect: Rect
  styles: NodeStyles
  selector: string
}

/** The node's corner radius in px (`50%` is resolved against the box), grown to the frame. */
function cornerRadius(styles: NodeStyles, corner: string, rect: Rect): number {
  const raw = styles.values[`border-${corner}-radius` as keyof NodeStyles['values']] ?? ''
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return FRAME_INSET - 1
  const radius = raw.trim().endsWith('%') ? (Math.min(rect.w, rect.h) * value) / 100 : value
  return radius + FRAME_INSET - 1
}

/**
 * Locked node (screens.md §05): 2 px accent frame with a tinted fill following the node's own
 * corners, and a chip `selector · W × H` above its top-left corner — inside the frame when the
 * node touches the top of the viewport.
 */
export function LockedFrame({ rect, styles, selector }: LockedFrameProps) {
  const t = useT('overlay')
  const left = rect.x - FRAME_INSET
  const top = rect.y - FRAME_INSET
  const radii = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
    .map((corner) => `${cornerRadius(styles, corner, rect)}px`)
    .join(' ')

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div
        aria-hidden="true"
        data-testid={TestId.PickerLockedFrame}
        className="absolute box-border border-2 border-accent border-solid bg-accent-tint"
        style={{
          left,
          top,
          width: rect.w + FRAME_INSET * 2,
          height: rect.h + FRAME_INSET * 2,
          borderRadius: radii,
        }}
      />
      <Chip
        left={Math.max(FRAME_INSET, left)}
        top={chipTop(top, FRAME_INSET)}
        label={t('picker.chip')}
        testId={TestId.PickerLockedChip}
      >
        {selector} · {formatBoxSize(rect.w, rect.h)}
      </Chip>
    </div>
  )
}
