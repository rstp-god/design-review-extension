import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  type Placement,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useMergeRefs,
  useRole,
} from '@floating-ui/react'
import { TestId, testIds } from '@tests/constants/testIds'
import {
  Children,
  cloneElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useRef,
  useState,
} from 'react'
import { cn } from './cn'
import { useFloatingRoot } from './FloatingRoot'

export interface MenuItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export interface MenuProps {
  items: ReadonlyArray<MenuItem>
  /** The trigger button; receives `ref`, `aria-*` and the click handler. */
  children: ReactElement<{ ref?: Ref<HTMLElement> }>
  placement?: Placement
  'aria-label'?: string
}

/**
 * Dropdown menu on a trigger. Arrow keys move, Enter / Space select, Escape and outside press
 * close; focus returns to the trigger. Items render into the floating root.
 */
export function Menu({ items, children, placement = 'bottom-end', ...aria }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<Array<HTMLElement | null>>([])
  const root = useFloatingRoot()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'menu' }),
    useListNavigation(context, { listRef, activeIndex, onNavigate: setActiveIndex, loop: true }),
  ])

  const child = Children.only(children)
  const ref = useMergeRefs([refs.setReference, child.props.ref ?? null])

  // `useRole` names the menu after its trigger; an explicit label must win over that.
  const floatingProps = getFloatingProps()
  if (aria['aria-label']) {
    floatingProps['aria-label'] = aria['aria-label']
    delete floatingProps['aria-labelledby']
  }

  const select = (item: MenuItem) => {
    if (item.disabled) return
    setOpen(false)
    item.onSelect()
  }

  return (
    <>
      {cloneElement(
        child,
        getReferenceProps({ ref, ...child.props, 'aria-expanded': open, 'aria-haspopup': 'menu' }),
      )}
      {open && (
        <FloatingPortal root={root}>
          <FloatingFocusManager context={context} modal={false} initialFocus={0}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...floatingProps}
              data-testid={TestId.Menu}
              className={cn(
                'z-30 flex min-w-[180px] flex-col gap-1 rounded-xl border border-border bg-bg p-4',
                'font-sans text-base text-fg shadow-popover',
              )}
            >
              {items.map((item, index) => (
                <button
                  key={item.id}
                  ref={(element) => {
                    listRef.current[index] = element
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={activeIndex === index ? 0 : -1}
                  disabled={item.disabled}
                  data-testid={testIds.menuItem(item.id)}
                  {...getItemProps({
                    onClick: () => select(item),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        select(item)
                      }
                    },
                  })}
                  className={cn(
                    'flex h-16 cursor-pointer items-center gap-8 rounded-md px-8 text-left',
                    'transition-colors duration-(--dr-duration) ease-out',
                    'hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
                    'disabled:cursor-default disabled:text-fg-disabled disabled:hover:bg-transparent',
                    item.danger ? 'text-danger' : 'text-fg',
                  )}
                >
                  {item.icon && (
                    <span
                      aria-hidden="true"
                      className="inline-flex size-16 items-center justify-center"
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
