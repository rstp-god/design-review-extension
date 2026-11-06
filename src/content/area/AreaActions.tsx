import { FloatingPortal, flip, offset, shift, useFloating } from '@floating-ui/react'
import { TestId } from '@tests/constants/testIds'
import { useLayoutEffect, useMemo } from 'react'
import { useT } from '@/content/i18n'
import { rectReference } from '@/content/overlay/rectReference'
import type { Rect } from '@/shared/model'
import { onlyTrusted } from '@/shared/trustedEvents'
import { Button, Kbd, useFloatingRoot } from '@/ui'

/** Gap between the area and its action bar (screens.md §08). */
const ACTIONS_OFFSET = 14

export interface AreaActionsProps {
  rect: Rect
  onReselect: () => void
  onIssue?: () => void
}

/**
 * «Замечание Enter» / «Перевыделить» under the bottom-right corner of the area, flipped above
 * or shifted when there is no room (Floating UI over a virtual reference, like the picker
 * tooltip). The issue button waits for feature `issue-capture`: soft-disabled, "coming soon".
 */
export function AreaActions({ rect, onReselect, onIssue }: AreaActionsProps) {
  const t = useT('overlay')
  const root = useFloatingRoot()

  const reference = useMemo(
    () => rectReference({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }),
    [rect.x, rect.y, rect.w, rect.h],
  )

  const { refs, floatingStyles } = useFloating({
    open: true,
    placement: 'bottom-end',
    middleware: [offset(ACTIONS_OFFSET), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  useLayoutEffect(() => {
    refs.setPositionReference(reference)
  }, [refs, reference])

  return (
    <FloatingPortal root={root}>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        data-testid={TestId.AreaActions}
        className="pointer-events-auto z-20 flex items-center gap-3 rounded-xl border border-border bg-bg p-2 shadow-popover"
      >
        <Button
          variant="primary"
          size="sm"
          disabled={!onIssue}
          onClick={onlyTrusted(onIssue)}
          data-testid={TestId.AreaIssue}
        >
          {t('area.issue')}
          <Kbd>Enter</Kbd>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid={TestId.AreaReselect}
          onClick={onlyTrusted(onReselect)}
        >
          {t('area.reselect')}
        </Button>
      </div>
    </FloatingPortal>
  )
}
