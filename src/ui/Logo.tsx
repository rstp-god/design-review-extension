import { Crosshair } from 'lucide-react'
import { cn } from './cn'

/** Product mark: `Crosshair` in an accent square (28 px, radius 7 by default). */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-ctl bg-accent text-accent-fg',
        className,
      )}
    >
      <Crosshair size={Math.round(size * 0.57)} strokeWidth={2} />
    </span>
  )
}
