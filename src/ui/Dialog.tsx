import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { TestId } from '@tests/constants/testIds'
import { type ReactNode, useId } from 'react'
import { cn } from './cn'
import { useFloatingRoot } from './FloatingRoot'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /** Action buttons, rendered right-aligned under the text. */
  actions: ReactNode
  /** `sheet`: pinned to the bottom (popup); `center`: centered (overlay). */
  position?: 'sheet' | 'center'
  children?: ReactNode
}

/**
 * Modal dialog over a scrim. Focus is trapped inside and returned on close; Escape and a press
 * on the scrim close it. Renders into the floating root, so in the overlay it stays inside our
 * shadow root and above everything else of ours.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  position = 'sheet',
  children,
}: DialogProps) {
  const root = useFloatingRoot()
  const titleId = useId()
  const descriptionId = useId()

  const { refs, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) onClose()
    },
  })

  const { getFloatingProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: 'mousedown' }),
    useRole(context, { role: 'dialog' }),
  ])

  if (!open) return null

  return (
    <FloatingPortal root={root}>
      {/* No `lockScroll`: in the overlay that would write styles onto the host page's body. */}
      <FloatingOverlay
        data-testid={TestId.DialogScrim}
        className={cn(
          'z-40 flex bg-scrim',
          position === 'sheet' ? 'items-end justify-center' : 'items-center justify-center p-8',
        )}
      >
        <FloatingFocusManager context={context} modal>
          <div
            ref={refs.setFloating}
            {...getFloatingProps({
              'aria-labelledby': titleId,
              'aria-describedby': description ? descriptionId : undefined,
            })}
            role="dialog"
            aria-modal="true"
            data-testid={TestId.Dialog}
            className={cn(
              'flex w-full flex-col gap-6 bg-surface-raised p-8 font-sans text-fg shadow-dialog',
              position === 'sheet'
                ? 'rounded-t-2xl border-t border-border'
                : 'max-w-[360px] rounded-2xl border border-border',
            )}
          >
            <h2 id={titleId} className="m-0 text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="m-0 text-base text-fg-secondary">
                {description}
              </p>
            )}
            {children}
            <div className="flex justify-end gap-4">{actions}</div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  )
}
