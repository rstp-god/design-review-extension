import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tool'
/** Heights from tokens.md §5: lg 44 · md 40 · sm 36 · xs 32. */
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icon-only button: square, needs `aria-label`. */
  iconOnly?: boolean
  /** Highlighted state for `tool` buttons (the active instrument). */
  active?: boolean
  /**
   * Looks and behaves disabled but stays focusable and hoverable, so a tooltip can explain why
   * ("coming soon"). A natively `disabled` button fires no pointer events at all.
   */
  softDisabled?: boolean
  type?: 'button' | 'submit'
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-6 select-none whitespace-nowrap font-sans ' +
  'cursor-pointer transition-colors duration-(--dr-duration) ease-out ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-default aria-disabled:cursor-default'

const variants: Record<ButtonVariant, string> = {
  primary:
    'rounded-lg bg-accent text-accent-fg font-semibold hover:brightness-110 ' +
    'disabled:bg-surface disabled:text-fg-disabled disabled:hover:brightness-100 ' +
    'aria-disabled:bg-surface aria-disabled:text-fg-disabled aria-disabled:hover:brightness-100',
  secondary:
    'rounded-lg border border-border-strong bg-transparent text-fg font-medium ' +
    'hover:bg-surface-hover ' +
    'disabled:text-fg-disabled disabled:hover:bg-transparent ' +
    'aria-disabled:text-fg-disabled aria-disabled:hover:bg-transparent',
  ghost:
    'rounded-md bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg ' +
    'disabled:text-fg-disabled disabled:hover:bg-transparent disabled:hover:text-fg-disabled ' +
    'aria-disabled:text-fg-disabled aria-disabled:hover:bg-transparent aria-disabled:hover:text-fg-disabled',
  danger:
    'rounded-lg border border-danger-border bg-transparent text-danger font-medium ' +
    'hover:bg-surface-hover disabled:text-fg-disabled aria-disabled:text-fg-disabled',
  tool:
    'rounded-lg bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg ' +
    'data-[active=true]:bg-accent data-[active=true]:text-accent-fg ' +
    'disabled:text-fg-disabled disabled:hover:bg-transparent disabled:hover:text-fg-disabled ' +
    'aria-disabled:text-fg-disabled aria-disabled:hover:bg-transparent aria-disabled:hover:text-fg-disabled',
}

const sizes: Record<ButtonSize, { box: string; square: string; text: string }> = {
  lg: { box: 'h-22 px-16', square: 'size-22', text: 'text-md' },
  md: { box: 'h-20 px-14', square: 'size-20', text: 'text-base' },
  sm: { box: 'h-18 px-12', square: 'size-18', text: 'text-base' },
  xs: { box: 'h-16 px-10', square: 'size-16', text: 'text-sm' },
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  active = false,
  softDisabled = false,
  disabled,
  type = 'button',
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const dimensions = sizes[size]

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (softDisabled) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-disabled={softDisabled || undefined}
      data-active={active || undefined}
      onClick={handleClick}
      className={cn(
        base,
        variants[variant],
        iconOnly ? dimensions.square : dimensions.box,
        dimensions.text,
        className,
      )}
    >
      {children}
    </button>
  )
}
