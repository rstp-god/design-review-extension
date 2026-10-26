import { Check } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
}

/** A real `<input type="checkbox">` inside its `<label>`; the box is drawn, the input is not hidden from AT. */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-8 text-base text-fg select-none',
        className,
      )}
    >
      <span className="relative inline-flex size-16 shrink-0">
        <input
          type="checkbox"
          {...rest}
          className={cn(
            'peer size-16 cursor-pointer appearance-none rounded-xs border border-border-strong bg-surface',
            'transition-colors duration-(--dr-duration) ease-out',
            'checked:border-accent checked:bg-accent',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'disabled:cursor-default disabled:opacity-50',
          )}
        />
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-12 text-accent-fg opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span>{label}</span>
    </label>
  )
}
