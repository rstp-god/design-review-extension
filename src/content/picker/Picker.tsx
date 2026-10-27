import { useCallback, useEffect, useMemo, useState } from 'react'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { installHotkeys } from '@/content/hotkeys'
import { useOverlayStore } from '@/content/store/overlay'
import type { Rect } from '@/shared/model'
import { blockPageEvents } from './blockPageEvents'
import { Highlight } from './Highlight'
import { LockedBar } from './LockedBar'
import { LockedFrame } from './LockedFrame'
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

interface LockedState {
  node: PickNode
  rect: Rect
  styles: NodeStyles
  path: PathEntry[]
  selector: string
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
  usePointerTracking({ source, active: mode === 'picking', onHover, onSample })

  const lock = useCallback(
    (node: PickNode) => {
      setLocked({
        node,
        rect: source.rectOf(node),
        styles: source.stylesOf(node),
        path: source.pathOf(node),
        selector: source.selectorOf(node),
      })
      setMode('locked')
    },
    [source, setMode],
  )

  // `Esc` (App) switches back to picking: the locked node is forgotten.
  useEffect(() => {
    if (mode === 'picking') setLocked(null)
  }, [mode])

  useEffect(
    () =>
      blockPageEvents({
        host: host.host,
        onClick: (event) => {
          const node = source.hitTest(event.clientX, event.clientY)
          if (node) lock(node)
        },
      }),
    [host, source, lock],
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
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
    }
  }, [mode, lockedNode, source])

  if (mode === 'locked' && locked) {
    return (
      <>
        <LockedFrame rect={locked.rect} styles={locked.styles} selector={locked.selector} />
        <LockedBar path={locked.path} active={locked.node} onPick={lock} />
      </>
    )
  }

  const entry = hover?.path.at(-1)
  if (mode !== 'picking' || !hover || !entry) return null
  return (
    <>
      <Highlight box={hover.box} />
      <PickerTooltip rect={hover.rect} entry={entry} styles={hover.styles} />
    </>
  )
}
