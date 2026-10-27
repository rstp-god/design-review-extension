import { useCallback, useEffect, useMemo, useState } from 'react'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { useOverlayStore } from '@/content/store/overlay'
import { blockPageEvents } from './blockPageEvents'
import { Highlight } from './Highlight'
import { PickerTooltip } from './PickerTooltip'
import { createSampler } from './perf'
import type { PickSource } from './source'
import { type HoverState, usePointerTracking } from './usePointerTracking'

const PERF_REPORT_EVERY = 10

export interface PickerProps {
  host: OverlayHost
  source: PickSource
}

/**
 * The element picker (spec 3.3). Mounted while the tool is active: installs the page click
 * blocker and the pointer tracking, renders the box-model highlight and the tooltip for the
 * hovered node. Everything it knows about the page comes from `source`.
 */
export function Picker({ host, source }: PickerProps) {
  const mode = useOverlayStore((state) => state.pickerMode)
  const [hover, setHover] = useState<HoverState | null>(null)

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

  useEffect(() => blockPageEvents({ host: host.host }), [host])

  const entry = hover?.path.at(-1)
  if (mode !== 'picking' || !hover || !entry) return null
  return (
    <>
      <Highlight box={hover.box} />
      <PickerTooltip rect={hover.rect} entry={entry} styles={hover.styles} />
    </>
  )
}
