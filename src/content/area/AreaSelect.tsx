import { TestId, testIds } from '@tests/constants/testIds'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { installHotkeys } from '@/content/hotkeys'
import { useT } from '@/content/i18n'
import type { IssueSelection } from '@/content/issue/selection'
import { Chip, chipTop } from '@/content/overlay/Chip'
import { blockPageEvents } from '@/content/picker/blockPageEvents'
import { Shields, useShieldRects } from '@/content/picker/Shields'
import type { PickSource } from '@/content/picker/source'
import { viewportSize } from '@/content/position'
import { useOverlayStore } from '@/content/store/overlay'
import type { Rect } from '@/shared/model'
import { isTrustedEvent } from '@/shared/trustedEvents'
import { cn } from '@/ui'
import { AreaActions } from './AreaActions'
import {
  CORNERS,
  type Corner,
  clampPoint,
  clampRect,
  cornerPoint,
  type DragModifiers,
  ensureMinSize,
  formatAreaChip,
  isTooSmall,
  NO_MODIFIERS,
  type Point,
  rectFromDrag,
  resizeFromCorner,
} from './geometry'

const HANDLE_SIZE = 10

type Drag = { kind: 'draw'; anchor: Point } | { kind: 'resize'; corner: Corner }

const HANDLE_CURSOR: Record<Corner, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
}

function modifiersOf(event: { shiftKey: boolean; altKey: boolean }): DragModifiers {
  return { square: event.shiftKey, fromCenter: event.altKey }
}

export interface AreaSelectProps {
  host: OverlayHost
  source: PickSource
  onIssue?: (selection: IssueSelection) => void
}

/**
 * The area tool (spec 3.4, screens.md §08). Mounted while the tool is active: the page is dimmed,
 * a drag draws a rectangle (Shift square, Alt from the center), releasing it shows the handles,
 * the chip and the actions; dragging a handle resizes it. The rectangle lives in viewport px on
 * a fixed layer: the page scrolls underneath, the area stays where it is, like a screenshot.
 *
 * Input follows the picker's rules: page clicks, selection and context menus are swallowed by the
 * same blocker while the tool is active (trusted events only), and the page keeps receiving
 * `pointermove`, so its `:hover` states stay alive. From the page the tool takes only
 * `shieldRects()` of its source — the rectangle itself needs no DOM, so a snapshot source works
 * unchanged.
 */
export function AreaSelect({ host, source, onIssue }: AreaSelectProps) {
  const t = useT('overlay')
  const mode = useOverlayStore((state) => state.areaMode)
  const setMode = useOverlayStore((state) => state.setAreaMode)
  const [rect, setRect] = useState<Rect | null>(null)
  const shields = useShieldRects(source)
  const debug = useMemo(() => createE2EDebug(host.host), [host])
  const issue = useCallback(() => {
    if (rect && onIssue) onIssue({ target: { kind: 'area', rect } })
  }, [rect, onIssue])
  useEffect(() => {
    if (mode !== 'adjusting' || !rect || !onIssue) return
    return installHotkeys([{ key: 'Enter', ignoreInEditable: true, handler: issue }])
  }, [mode, rect, onIssue, issue])

  // The drag in progress and the latest input, read by the animation frame.
  const current = useRef<Rect | null>(null)
  const drag = useRef<Drag | null>(null)
  const pointer = useRef<Point | null>(null)
  const modifiers = useRef<DragModifiers>(NO_MODIFIERS)
  const frame = useRef(0)

  const update = useCallback((next: Rect | null) => {
    current.current = next
    setRect(next)
  }, [])

  const cancelFrame = useCallback(() => {
    if (frame.current !== 0) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [])

  /** Applies the latest pointer position and modifiers to the drag, at most once per frame. */
  const apply = useCallback(() => {
    frame.current = 0
    const active = drag.current
    const point = pointer.current
    if (!active || !point) return
    const viewport = viewportSize()
    if (active.kind === 'draw') {
      update(rectFromDrag(active.anchor, point, modifiers.current, viewport))
      return
    }
    const previous = current.current
    if (!previous) return
    const next = resizeFromCorner(previous, active.corner, point, modifiers.current, viewport)
    active.corner = next.corner
    update(next.rect)
  }, [update])

  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(apply)
  }, [apply])

  const startDraw = useCallback(
    (point: Point, mods: DragModifiers) => {
      if (drag.current) return
      const viewport = viewportSize()
      drag.current = { kind: 'draw', anchor: clampPoint(point, viewport) }
      pointer.current = point
      modifiers.current = mods
      update(rectFromDrag(point, point, mods, viewport))
      setMode('dragging')
    },
    [setMode, update],
  )

  /** Ends the drag with the latest input: a click-sized drawing is dropped, a tiny resize grown. */
  const finish = useCallback(() => {
    const active = drag.current
    if (!active) return
    cancelFrame()
    apply()
    drag.current = null
    const final = current.current
    if (active.kind === 'draw') {
      if (!final || isTooSmall(final)) {
        update(null)
        setMode('drawing')
      } else {
        setMode('adjusting')
      }
      return
    }
    if (final) update(ensureMinSize(final, active.corner, viewportSize()))
  }, [apply, cancelFrame, setMode, update])

  // `Esc` / «Перевыделить» put the store back to `drawing`: the rectangle goes with it.
  useEffect(() => {
    if (mode !== 'drawing') return
    drag.current = null
    cancelFrame()
    update(null)
  }, [mode, cancelFrame, update])

  /** The primary button went up: the drag ends where the pointer is. */
  const onUp = useCallback(
    (event: PointerEvent) => {
      if (!drag.current || event.button !== 0 || !isTrustedEvent(event)) return
      pointer.current = { x: event.clientX, y: event.clientY }
      modifiers.current = modifiersOf(event)
      finish()
    },
    [finish],
  )

  // Pointer input. A `pointerup` over our own UI (a shield, a handle, the toolbar) arrives here;
  // one over the page is swallowed by the blocker below and reported through its callback, so
  // the two listeners never depend on each other's order. A move with no button held means the
  // release happened where no `pointerup` reached us (outside the window): the drag ends then.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!drag.current || !isTrustedEvent(event) || debug?.frozen()) return
      pointer.current = { x: event.clientX, y: event.clientY }
      modifiers.current = modifiersOf(event)
      if (event.buttons === 0) {
        finish()
        return
      }
      schedule()
    }
    // Shift / Alt pressed or released without moving the mouse redraw the rectangle. A bare Alt
    // would hand the focus to Chrome's menu bar on Windows (and blur the page mid-drag).
    const onModifier = (event: KeyboardEvent) => {
      if (!drag.current || !isTrustedEvent(event)) return
      if (event.key !== 'Shift' && event.key !== 'Alt') return
      if (event.key === 'Alt') event.preventDefault()
      modifiers.current = modifiersOf(event)
      schedule()
    }
    const onLost = () => {
      if (drag.current) finish()
    }
    window.addEventListener('pointermove', onMove, { capture: true, passive: true })
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onLost, true)
    window.addEventListener('keydown', onModifier, true)
    window.addEventListener('keyup', onModifier, true)
    window.addEventListener('blur', onLost)
    return () => {
      window.removeEventListener('pointermove', onMove, { capture: true })
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onLost, true)
      window.removeEventListener('keydown', onModifier, true)
      window.removeEventListener('keyup', onModifier, true)
      window.removeEventListener('blur', onLost)
    }
  }, [debug, schedule, finish, onUp])

  useEffect(
    () =>
      blockPageEvents({
        host: host.host,
        onPointerDown: (event) => {
          if (event.button === 0) {
            startDraw({ x: event.clientX, y: event.clientY }, modifiersOf(event))
          }
        },
        onPointerUp: onUp,
      }),
    [host, startDraw, onUp],
  )

  // The window shrank: keep the area inside it.
  useEffect(() => {
    const onResize = () => {
      const previous = current.current
      if (previous && !drag.current) update(clampRect(previous, viewportSize()))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [update])

  useEffect(() => cancelFrame, [cancelFrame])

  const onHandleDown = (corner: Corner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !isTrustedEvent(event) || drag.current) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { kind: 'resize', corner }
    pointer.current = { x: event.clientX, y: event.clientY }
    modifiers.current = modifiersOf(event)
  }

  const onShieldDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button === 0) startDraw({ x: event.clientX, y: event.clientY }, modifiersOf(event))
  }

  return (
    <>
      <Shields
        rects={shields}
        label={t('area.shield')}
        cursor="crosshair"
        onPointerDown={onShieldDown}
      />
      <div
        aria-hidden="true"
        data-testid={TestId.AreaLayer}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {rect ? (
          <div
            data-testid={TestId.AreaSelection}
            className="absolute box-border border-[1.5px] border-accent border-dashed bg-accent-tint"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              boxShadow: '0 0 0 200vmax var(--dr-page-dim)',
            }}
          />
        ) : (
          <div data-testid={TestId.AreaDim} className="absolute inset-0 bg-page-dim" />
        )}
      </div>
      {rect && (
        <div className="pointer-events-none fixed inset-0 z-10">
          {mode === 'adjusting' &&
            CORNERS.map((corner) => {
              const point = cornerPoint(rect, corner)
              return (
                <button
                  key={corner}
                  type="button"
                  aria-label={t(`area.handle.${corner}`)}
                  data-testid={testIds.areaHandle(corner)}
                  onPointerDown={onHandleDown(corner)}
                  className={cn(
                    'pointer-events-auto absolute m-0 box-border size-5 border-[1.5px] border-accent border-solid bg-white p-0 touch-none',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    HANDLE_CURSOR[corner],
                  )}
                  style={{ left: point.x - HANDLE_SIZE / 2, top: point.y - HANDLE_SIZE / 2 }}
                />
              )
            })}
          <Chip
            left={Math.max(0, rect.x)}
            top={chipTop(rect.y)}
            label={t('area.chip')}
            testId={TestId.AreaChip}
          >
            {formatAreaChip(rect)}
          </Chip>
        </div>
      )}
      {rect && mode === 'adjusting' && (
        <AreaActions
          rect={rect}
          onReselect={() => setMode('drawing')}
          onIssue={onIssue ? issue : undefined}
        />
      )}
    </>
  )
}
