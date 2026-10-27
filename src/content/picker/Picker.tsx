import { testIds } from '@tests/constants/testIds'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { installHotkeys } from '@/content/hotkeys'
import { useT } from '@/content/i18n'
import { overlaySurfaceAt } from '@/content/overlay/surfaces'
import { useOverlayStore } from '@/content/store/overlay'
import type { Rect } from '@/shared/model'
import { isTrustedEvent } from '@/shared/trustedEvents'
import { blockPageEvents } from './blockPageEvents'
import { Highlight } from './Highlight'
import { LockedBar } from './LockedBar'
import { LockedFrame } from './LockedFrame'
import { onLayoutChange } from './layoutChange'
import { ARROW_KEYS, navigateFrom } from './navigation'
import { PickerTooltip } from './PickerTooltip'
import { createSampler } from './perf'
import type { NodeStyles, PathEntry, PickNode, PickSource } from './source'
import { type HoverState, usePointerTracking } from './usePointerTracking'

const PERF_REPORT_EVERY = 10

export interface PickerProps {
  host: OverlayHost
  source: PickSource
}

function sameRects(a: Rect[], b: Rect[]): boolean {
  return (
    a.length === b.length &&
    a.every((rect, i) => {
      const other = b[i]
      return (
        other !== undefined &&
        rect.x === other.x &&
        rect.y === other.y &&
        rect.w === other.w &&
        rect.h === other.h
      )
    })
  )
}

interface LockedState {
  node: PickNode
  rect: Rect
  styles: NodeStyles
  path: PathEntry[]
  selector: string
}

/**
 * Transparent covers over iframes while picking: pointer events inside a frame never reach the
 * top document, so without them a frame could be neither hovered nor locked as a whole.
 */
function Shields({ rects, onPick }: { rects: Rect[]; onPick: (x: number, y: number) => void }) {
  const t = useT('overlay')
  if (rects.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {rects.map((rect, index) => (
        <button
          key={`${rect.x}:${rect.y}:${rect.w}:${rect.h}`}
          type="button"
          tabIndex={-1}
          aria-label={t('picker.shield')}
          data-testid={testIds.pickerShield(index)}
          className="pointer-events-auto absolute m-0 cursor-default border-0 bg-transparent p-0"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          onClick={(event) => {
            if (isTrustedEvent(event)) onPick(event.clientX, event.clientY)
          }}
          onContextMenu={(event) => event.preventDefault()}
        />
      ))}
    </div>
  )
}

/**
 * The element picker (spec 3.3). Mounted while the tool is active: installs the page click
 * blocker and the pointer tracking, renders the box-model highlight and the tooltip for the
 * hovered node; a click locks the node (frame, chip, breadcrumbs, arrow keys) until `Esc` or
 * another click. Everything it knows about the page comes from `source`.
 */
export function Picker({ host, source }: PickerProps) {
  const mode = useOverlayStore((state) => state.pickerMode)
  const setMode = useOverlayStore((state) => state.setPickerMode)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [locked, setLocked] = useState<LockedState | null>(null)
  const [shields, setShields] = useState<Rect[]>([])
  const lockedNode = locked?.node ?? null

  const debug = useMemo(() => createE2EDebug(host.host), [host])
  const sampler = useMemo(() => createSampler(), [])
  const onSample = useMemo(() => {
    if (!debug) return undefined
    return (ms: number) => {
      sampler.add(ms)
      if (sampler.size % PERF_REPORT_EVERY === 0) {
        debug.set('pointermove', JSON.stringify(sampler.stats()))
      }
    }
  }, [debug, sampler])

  const onHover = useCallback((next: HoverState | null) => setHover(next), [])
  const isOverUi = useCallback(
    (x: number, y: number) => overlaySurfaceAt(host.shadowRoot, x, y),
    [host],
  )
  usePointerTracking({
    source,
    active: mode === 'picking',
    onHover,
    onSample,
    frozen: debug?.frozen,
    isOverUi,
  })

  // Going up (`↑`, a crumb) keeps the trail below the new node, like the mockup's
  // `main › section › [div.product-card] › button`; anywhere else the path is rebuilt.
  const lock = useCallback(
    (node: PickNode) => {
      setLocked((previous) => ({
        node,
        rect: source.rectOf(node),
        styles: source.stylesOf(node),
        path: previous?.path.some((entry) => entry.node === node)
          ? previous.path
          : source.pathOf(node),
        selector: source.selectorOf(node),
      }))
      setMode('locked')
    },
    [source, setMode],
  )

  const pickAt = useCallback(
    (x: number, y: number) => {
      const node = source.hitTest(x, y)
      if (node) lock(node)
    },
    [source, lock],
  )

  // `Esc` (App) switches back to picking: the locked node is forgotten.
  useEffect(() => {
    if (mode === 'picking') setLocked(null)
  }, [mode])

  // Shields over frames, in both modes (a frame click must not reach the frame while a node is
  // locked either): re-measured on scroll / resize, one measurement per frame, state kept when
  // nothing moved so a scroll on a page without frames re-renders nothing.
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const next = source.shieldRects()
      setShields((previous) => (sameRects(previous, next) ? previous : next))
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure()
    const unsubscribe = onLayoutChange(schedule)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [source])

  useEffect(
    () =>
      blockPageEvents({
        host: host.host,
        onClick: (event) => pickAt(event.clientX, event.clientY),
      }),
    [host, pickAt],
  )

  // Arrow keys only in Locked: while picking the page keeps scrolling with them.
  useEffect(() => {
    if (mode !== 'locked' || !lockedNode) return
    return installHotkeys(
      ARROW_KEYS.map((key) => ({
        key,
        ignoreInEditable: true,
        handler: () => {
          const next = navigateFrom(source, lockedNode, key)
          if (next) lock(next)
        },
      })),
    )
  }, [mode, lockedNode, source, lock])

  // The frame follows the node through scroll and resize, one measurement per frame.
  useEffect(() => {
    if (mode !== 'locked' || !lockedNode) return
    let frame = 0
    const remeasure = () => {
      frame = 0
      setLocked((previous) =>
        previous ? { ...previous, rect: source.rectOf(previous.node) } : previous,
      )
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(remeasure)
    }
    const unsubscribe = onLayoutChange(schedule)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [mode, lockedNode, source])

  if (mode === 'locked' && locked) {
    return (
      <>
        <Shields rects={shields} onPick={pickAt} />
        <LockedFrame rect={locked.rect} styles={locked.styles} selector={locked.selector} />
        <LockedBar path={locked.path} active={locked.node} onPick={lock} />
      </>
    )
  }

  const entry = hover?.path.at(-1)
  if (mode !== 'picking') return null
  return (
    <>
      <Shields rects={shields} onPick={pickAt} />
      {hover && entry && (
        <>
          <Highlight box={hover.box} />
          <PickerTooltip rect={hover.rect} entry={entry} styles={hover.styles} />
        </>
      )}
    </>
  )
}
