import { useEffect, useMemo } from 'react'
import { AreaSelect } from '@/content/area/AreaSelect'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { installHotkeys } from '@/content/hotkeys'
import { OverlayI18nProvider } from '@/content/i18n'
import { createLiveSource } from '@/content/picker/live'
import { Picker } from '@/content/picker/Picker'
import {
  type SnapshotController,
  useSnapshotController,
} from '@/content/snapshot/useSnapshotController'
import { locationWatchStrategy, watchLocation } from '@/content/spaNavigation'
import { useOverlayStore } from '@/content/store/overlay'
import { applyTheme } from '@/content/theme'
import type { UiLanguage } from '@/i18n/resolveLanguage'
import { normalizePath } from '@/shared/sessionKey'
import { useSettingsStore } from '@/store/settings'
import { FloatingRootProvider } from '@/ui'
import { Hint } from './Hint'
import { SnapshotLayer } from './SnapshotLayer'
import { Toast } from './Toast'
import { Toolbar } from './Toolbar'

export interface AppProps {
  host: OverlayHost
  language: UiLanguage
  onExit: () => void
}

/**
 * `Esc` is one step back everywhere (spec 3.11): a countdown is cancelled; Locked → Picking →
 * picker off; for the area: adjusting (or a drag in progress) → drawing → tool off; a snapshot
 * with no tool goes back to the live page; only then the review ends. The toolbar's exit button
 * leaves at once.
 */
function stepBack(onExit: () => void, snapshot: SnapshotController): void {
  const state = useOverlayStore.getState()
  if (state.snapshotPhase === 'countdown') {
    snapshot.cancelCountdown()
    return
  }
  if (state.snapshotPhase === 'capturing') return
  if (state.tool === 'picker' && state.pickerMode === 'locked') {
    state.setPickerMode('picking')
    return
  }
  if (state.tool === 'area' && state.areaMode !== 'drawing') {
    state.setAreaMode('drawing')
    return
  }
  if (state.tool !== 'none') {
    state.setTool('none')
    return
  }
  if (state.snapshotPhase === 'snapshot') {
    snapshot.exit()
    return
  }
  onExit()
}

/** Root of the overlay: providers and theme around the review itself. */
export function App({ host, language, onExit }: AppProps) {
  const theme = useSettingsStore((state) => state.theme)
  useEffect(() => applyTheme(host.host, theme), [host, theme])

  return (
    <OverlayI18nProvider language={language}>
      <FloatingRootProvider container={host.floating}>
        <Review host={host} onExit={onExit} />
      </FloatingRootProvider>
    </OverlayI18nProvider>
  )
}

/** Hotkeys, SPA tracking, the pick source of the moment, then the toolbar, tools and hints. */
function Review({ host, onExit }: Omit<AppProps, 'language'>) {
  const setPagePath = useOverlayStore((state) => state.setPagePath)
  const tool = useOverlayStore((state) => state.tool)
  const liveSource = useMemo(() => createLiveSource({ host: host.host }), [host])
  const snapshot = useSnapshotController(host)
  // The tools never know which page they read: live or frozen, the interface is the same.
  const source = snapshot.source ?? liveSource

  useEffect(() => () => liveSource.dispose(), [liveSource])

  useEffect(
    () =>
      installHotkeys([
        { key: 'Escape', handler: () => stepBack(onExit, snapshot) },
        { key: 'p', code: 'KeyP', handler: () => useOverlayStore.getState().togglePicker() },
        { key: 'a', code: 'KeyA', handler: () => useOverlayStore.getState().toggleArea() },
        { key: 'f', code: 'KeyF', handler: () => snapshot.toggle() },
        { key: 'f', code: 'KeyF', shift: true, handler: () => snapshot.startCountdown() },
      ]),
    [onExit, snapshot],
  )

  useEffect(() => {
    const debug = createE2EDebug(host.host)
    const update = (pathname: string) => {
      setPagePath(pathname)
      debug?.set('page-path', pathname)
    }
    debug?.set('nav', locationWatchStrategy())
    update(normalizePath(window.location.pathname))
    return watchLocation(({ pathname }) => update(pathname))
  }, [host, setPagePath])

  return (
    <>
      {snapshot.snapshot && <SnapshotLayer snapshot={snapshot.snapshot} />}
      <Toolbar onExit={onExit} />
      {tool === 'picker' && <Picker host={host} source={source} />}
      {tool === 'area' && <AreaSelect host={host} source={source} />}
      <Hint />
      <Toast />
    </>
  )
}
