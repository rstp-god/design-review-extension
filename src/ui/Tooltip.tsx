import {
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  type Placement,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
} from '@floating-ui/react'
import { TestId } from '@tests/constants/testIds'
import {
  Children,
  cloneElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  useState,
} from 'react'
import { cn } from './cn'
import { useFloatingRoot } from './FloatingRoot'
import { KeyCombo } from './Kbd'

export interface TooltipProps extends Omit<HTMLAttributes<HTMLElement>, 'content' | 'children'> {
  /** Text, or a label with key caps: `{ label, keys }`. */
  content: ReactNode | { label: ReactNode; keys?: readonly string[] }
  children: ReactElement<{ ref?: Ref<HTMLElement> }>
  placement?: Placement
  openDelay?: number
  className?: string
  /** A parent (a `Menu` trigger) may hand a ref down: it reaches the child too. */
  ref?: Ref<HTMLElement>
}

function isLabelWithKeys(
  content: TooltipProps['content'],
): content is { label: ReactNode; keys?: readonly string[] } {
  return typeof content === 'object' && content !== null && 'label' in content
}

/**
 * Hover / focus tooltip. Renders into the floating root (inside our shadow root in the overlay),
 * flips and shifts to stay in the viewport. The child must forward `ref` and props to a DOM node.
 * Anything else given to the tooltip (a `Menu` wrapping it injects a ref, `aria-*` and handlers)
 * is passed on to the child, so a button can have both a tooltip and a menu.
 */
export function Tooltip({
  content,
  children,
  placement = 'bottom',
  openDelay = 250,
  className,
  ref: outerRef,
  ...passthrough
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const root = useFloatingRoot()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { move: false, delay: { open: openDelay, close: 0 } }),
    useFocus(context),
    // A press on the button closes the tooltip: a menu or an action takes its place.
    useDismiss(context, { referencePress: true }),
    useRole(context, { role: 'tooltip' }),
  ])

  const child = Children.only(children)
  const ref = useMergeRefs([refs.setReference, child.props.ref ?? null, outerRef ?? null])

  return (
    <>
      {cloneElement(child, getReferenceProps({ ...passthrough, ref, ...child.props }))}
      {open && (
        <FloatingPortal root={root}>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            data-testid={TestId.Tooltip}
            className={cn(
              'pointer-events-none z-20 inline-flex max-w-[260px] items-center gap-4 rounded-lg',
              'border border-border bg-bg px-5 py-3 font-sans text-sm text-fg shadow-popover',
              className,
            )}
          >
            {isLabelWithKeys(content) ? (
              <>
                <span>{content.label}</span>
                {content.keys && content.keys.length > 0 && <KeyCombo keys={content.keys} />}
              </>
            ) : (
              content
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
