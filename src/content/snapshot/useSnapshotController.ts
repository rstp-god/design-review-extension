import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { createSnapshotSource, type SnapshotSource } from '@/content/picker/snapshot'
import { useOverlayStore } from '@/content/store/overlay'
import { useSettingsStore } from '@/store/settings'
import { SLOW_WALK_MS, type Snapshot, SnapshotError, takeSnapshot } from './capture'
import { lockScroll } from './scrollLock'

export interface SnapshotController {
  /** The frozen picture and nodes while a snapshot is up. */
  snapshot: Snapshot | null
  /** The pick source over the snapshot, `null` on the live page. */
  source: SnapshotSource | null
  /** `F` / "Now": a snapshot right away; on a snapshot — back to the live page. */
  toggle: () => void
  takeNow: () => void
  /** `Shift+F` / "In N s": the delay from the settings unless given; a running countdown starts over. */
  startCountdown: (seconds?: number) => void
  cancelCountdown: () => void
  exit: () => void
}

/**
 * Owns the snapshot lifecycle (spec 3.5): countdown → capture → frozen page → back. The store
 * carries the phase and what the UI shows; the picture and the nodes live here, they are big and
 * nobody but the tools needs them. Every transition and its message come from one place.
 */
export function useSnapshotController(host: OverlayHost): SnapshotController {
  const [snapshot, setSnapshotData] = useState<Snapshot | null>(null)
  const phase = useOverlayStore((state) => state.snapshotPhase)
  const countdown = useOverlayStore((state) => state.countdown)
  const debug = useMemo(() => createE2EDebug(host.host), [host])
  /** Guards against a second shutter while one is in flight (double `F`). */
  const inFlight = useRef(false)

  const source = useMemo(
    () =>
      snapshot
        ? createSnapshotSource({
            nodes: snapshot.nodes,
            hittable: snapshot.hittable,
            rootFontSize: snapshot.rootFontSize,
            viewport: snapshot.viewport,
          })
        : null,
    [snapshot],
  )

  // A replaced or dropped picture releases its bitmap; the source with it.
  useEffect(() => {
    if (!snapshot) return
    return () => {
      snapshot.bitmap.close()
    }
  }, [snapshot])
  useEffect(() => () => source?.dispose(), [source])

  const exit = useCallback(() => {
    setSnapshotData(null)
    useOverlayStore.getState().exitSnapshot()
  }, [])

  const takeNow = useCallback(() => {
    if (inFlight.current) return
    const store = useOverlayStore.getState()
    inFlight.current = true
    store.beginCapture()
    const settings = useSettingsStore.getState()
    void takeSnapshot({
      host: host.host,
      fields: settings.tooltipFields,
      sampleAccuracy: debug !== null,
    })
      .then((taken) => {
        setSnapshotData((previous) => {
          previous?.bitmap.close()
          return taken
        })
        useOverlayStore.getState().setSnapshot({ takenAt: taken.takenAt })
        if (taken.timings.walkMs > SLOW_WALK_MS) {
          useOverlayStore
            .getState()
            .showToast('snapshot.slow', { seconds: (taken.timings.walkMs / 1000).toFixed(1) })
        }
        debug?.set(
          'snapshot',
          JSON.stringify({
            ...taken.timings,
            nodes: taken.nodes.length,
            hittable: taken.hittable.length,
            visited: taken.visited,
            dpr: taken.dpr,
            bitmap: { w: taken.bitmap.width, h: taken.bitmap.height },
            accuracy: taken.accuracy,
          }),
        )
      })
      .catch((error: unknown) => {
        const reason = error instanceof SnapshotError ? error.reason : 'capture'
        if (reason !== 'hidden') console.warn('[snapshot] failed:', error)
        const current = useOverlayStore.getState()
        current.exitSnapshot()
        current.showToast(reason === 'hidden' ? 'snapshot.hidden' : 'snapshot.failed')
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [host, debug])

  const startCountdown = useCallback((seconds?: number) => {
    const store = useOverlayStore.getState()
    if (store.snapshotPhase === 'capturing') return
    if (store.snapshotPhase === 'snapshot') setSnapshotData(null)
    store.startCountdown(seconds ?? useSettingsStore.getState().freezeDelay)
  }, [])

  const cancelCountdown = useCallback(() => {
    useOverlayStore.getState().cancelCountdown()
  }, [])

  const toggle = useCallback(() => {
    const store = useOverlayStore.getState()
    switch (store.snapshotPhase) {
      case 'snapshot':
        exit()
        return
      case 'countdown':
        store.cancelCountdown()
        takeNow()
        return
      case 'capturing':
        return
      default:
        takeNow()
    }
  }, [exit, takeNow])

  // The shutter fires when the countdown ends; a hidden tab cancels it — the picture would be
  // of whatever tab is in front.
  useEffect(() => {
    if (phase !== 'countdown' || !countdown) return
    const timer = window.setTimeout(takeNow, Math.max(0, countdown.endsAt - Date.now()))
    const onVisibility = () => {
      if (!document.hidden) return
      const store = useOverlayStore.getState()
      store.cancelCountdown()
      store.showToast('snapshot.hidden')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [phase, countdown, takeNow])

  // The picture matches one viewport and one pixel ratio: a resize or a zoom change ends it.
  useEffect(() => {
    if (!snapshot) return
    const unlock = lockScroll(host.host)
    const leave = () => {
      exit()
      useOverlayStore.getState().showToast('snapshot.resized')
    }
    const onResize = () => {
      if (
        window.innerWidth !== snapshot.viewport.w ||
        window.innerHeight !== snapshot.viewport.h ||
        window.devicePixelRatio !== snapshot.dpr
      ) {
        leave()
      }
    }
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(`(resolution: ${snapshot.dpr}dppx)`)
        : null
    const onMedia = () => {
      if (window.devicePixelRatio !== snapshot.dpr) leave()
    }
    window.addEventListener('resize', onResize)
    media?.addEventListener('change', onMedia)
    return () => {
      unlock()
      window.removeEventListener('resize', onResize)
      media?.removeEventListener('change', onMedia)
    }
  }, [snapshot, host, exit])

  return { snapshot, source, toggle, takeNow, startCountdown, cancelCountdown, exit }
}
