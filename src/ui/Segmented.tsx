import { testIds } from '@tests/constants/testIds'
import { type ReactNode, useId } from 'react'
import { cn } from './cn'

export interface SegmentedOption<Value extends string | number> {
  value: Value
  label: ReactNode
  /** Accessible name when `label` is not plain text (icons, mono values). */
  ariaLabel?: string
}

export interface SegmentedProps<Value extends string | number> {
  options: ReadonlyArray<SegmentedOption<Value>>
  value: Value
  onChange: (value: Value) => void
  /** 28 px in settings rows, 30 px for severity / scope pickers (tokens.md §5). */
  size?: 'sm' | 'md'
  fullWidth?: boolean
  mono?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  /** Base for option test ids: `<testId>-option-<value>` (on the clickable label). */
  testId?: string
  className?: string
}

/**
 * Single-choice control built on native radio inputs: the browser provides the group semantics,
 * arrow-key navigation and the single tab stop; we only draw it. Labels carry the look, inputs
 * stay in the accessibility tree (`sr-only`, not `display: none`).
 */
export function Segmented<Value extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  fullWidth = false,
  mono = false,
  testId,
  className,
  ...aria
}: SegmentedProps<Value>) {
  const name = useId()

  return (
    <fieldset
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      className={cn(
        'm-0 inline-flex min-w-0 gap-1 rounded-ctl border border-border-strong bg-surface p-1',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <label
            key={String(option.value)}
            data-testid={testId ? testIds.segmentOption(testId, option.value) : undefined}
            className={cn(
              'relative inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-3',
              'whitespace-nowrap rounded-sm px-5 transition-colors duration-(--dr-duration) ease-out',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent',
              size === 'sm' ? 'h-14 text-sm' : 'h-15 text-base',
              mono && 'font-mono',
              checked
                ? 'bg-surface-selected font-medium text-fg'
                : 'text-fg-inactive hover:text-fg',
            )}
          >
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={checked}
              aria-label={option.ariaLabel}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </fieldset>
  )
}
