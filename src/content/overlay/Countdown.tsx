import { TestId } from '@tests/constants/testIds'
import { useEffect, useState } from 'react'
import { useT } from '@/content/i18n'
import type { Point, Size } from '@/content/position'
import { viewportSize } from '@/content/position'
import { useOverlayStore } from '@/content/store/overlay'
import { onlyTrusted } from '@/shared/trustedEvents'
import { Button, cn } from '@/ui'
import { surfaceProps } from './surfaces'

const RING_RADIUS = 15
const RING_STROKE = 3
const RING_SIZE = 36
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export type CountdownCorner = 'bottom-right' | 'top-left'

/**
 * The pill lives in the bottom-right corner — the toolbar's default is top-right, the hint is at
 * the bottom center. When the toolbar has been dragged into the bottom-right quadrant the pill
 * moves to the opposite corner.
 */
export function countdownCorner(toolbar: Point | null, viewport: Size): CountdownCorner {
  if (toolbar && toolbar.x > viewport.w / 2 && toolbar.y > viewport.h / 2) return 'top-left'
  return 'bottom-right'
}

/** Whole seconds left, never below zero. */
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

/**
 * Countdown to a delayed snapshot (spec F5.3, screens.md §03): a ring that empties by the second,
 * the seconds, "Snapshot in N s · Hover the state you need" and Cancel. Nothing here takes the
 * pointer except the button, and nothing takes the focus: the user is busy hovering the state
 * the snapshot is for. The shutter itself is the controller's (snapshot/useSnapshotController.ts).
 */
export function Countdown() {
  const t = useT('overlay')
  const tCommon = useT('common')
  const countdown = useOverlayStore((state) => state.countdown)
  const cancel = useOverlayStore((state) => state.cancelCountdown)
  const toolbar = useOverlayStore((state) => state.position)
  const [, setTick] = useState(0)
  // The clock is read on every render; a tick at each second boundary of the deadline asks for
  // the next render — no free-running interval, and a restarted countdown is current at once.
  const now = Date.now()

  useEffect(() => {
    if (!countdown) return
    const left = countdown.endsAt - now
    if (left <= 0) return
    const timer = window.setTimeout(() => setTick((tick) => tick + 1), (left % 1000 || 1000) + 10)
    return () => window.clearTimeout(timer)
  }, [countdown, now])

  if (!countdown) return null
  const seconds = secondsLeft(countdown.endsAt, now)
  const fraction = countdown.total > 0 ? seconds / countdown.total : 0
  const corner = countdownCorner(toolbar, viewportSize())

  return (
    <div
      className={cn(
        'pointer-events-none fixed z-10 flex',
        corner === 'bottom-right' ? 'right-8 bottom-8' : 'top-8 left-8',
      )}
    >
      <div
        role="status"
        data-testid={TestId.Countdown}
        data-corner={corner}
        {...surfaceProps('countdown')}
        className="flex items-center gap-6 rounded-2xl border border-border bg-bg py-4 pr-4 pl-5 text-fg text-sm shadow-float"
      >
        <span className="relative flex size-18 items-center justify-center" aria-hidden="true">
          <svg
            role="presentation"
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="absolute inset-0"
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              className="stroke-surface-hover"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              className="stroke-accent transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </svg>
          <span
            data-testid={TestId.CountdownSeconds}
            className="font-medium font-mono text-lg tabular-nums"
          >
            {seconds}
          </span>
        </span>
        <span className="flex flex-col gap-1">
          <span className="font-semibold">{t('countdown.title', { count: seconds })}</span>
          <span className="text-fg-muted">{t('countdown.hint')}</span>
        </span>
        <Button
          variant="secondary"
          size="xs"
          data-testid={TestId.CountdownCancel}
          className="pointer-events-auto"
          onClick={onlyTrusted(cancel)}
        >
          {tCommon('actions.cancel')}
        </Button>
      </div>
    </div>
  )
}
