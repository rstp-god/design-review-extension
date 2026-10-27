import { useEffect, useMemo } from 'react'
import { AreaSelect } from '@/content/area/AreaSelect'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { installHotkeys } from '@/content/hotkeys'
import { OverlayI18nProvider } from '@/content/i18n'
import { createLiveSource } from '@/content/picker/live'
import { Picker } from '@/content/picker/Picker'
import { locationWatchStrategy, watchLocation } from '@/content/spaNavigation'
import { useOverlayStore } from '@/content/store/overlay'
import { applyTheme } from '@/content/theme'
import type { UiLanguage } from '@/i18n/resolveLanguage'
import { normalizePath } from '@/shared/sessionKey'
import { useSettingsStore } from '@/store/settings'
import { FloatingRootProvider } from '@/ui'
import { Hint } from './Hint'
import { Toolbar } from './Toolbar'

export interface AppProps {
  host: OverlayHost
  language: UiLanguage
  onExit: () => void
}

/**
 * `Esc` is one step back everywhere (spec 3.11): Locked → Picking → picker off → leave the
 * review; for the area: adjusting (or a drag in progress) → drawing → tool off → leave. The
 * toolbar's exit button leaves at once.
 */
function stepBack(onExit: () => void): void {
  const state = useOverlayStore.getState()
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
  onExit()
}

/** Root of the overlay: providers, theme, hotkeys, SPA tracking, then the toolbar, tools and hint. */
export function App({ host, language, onExit }: AppProps) {
  const theme = useSettingsStore((state) => state.theme)
  const setPagePath = useOverlayStore((state) => state.setPagePath)
  const tool = useOverlayStore((state) => state.tool)
  const source = useMemo(() => createLiveSource({ host: host.host }), [host])

  useEffect(() => () => source.dispose(), [source])

  useEffect(() => applyTheme(host.host, theme), [host, theme])

  useEffect(
    () =>
      installHotkeys([
        { key: 'Escape', handler: () => stepBack(onExit) },
        { key: 'p', code: 'KeyP', handler: () => useOverlayStore.getState().togglePicker() },
        { key: 'a', code: 'KeyA', handler: () => useOverlayStore.getState().toggleArea() },
      ]),
    [onExit],
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
    <OverlayI18nProvider language={language}>
      <FloatingRootProvider container={host.floating}>
        <Toolbar onExit={onExit} />
        {tool === 'picker' && <Picker host={host} source={source} />}
        {tool === 'area' && <AreaSelect host={host} source={source} />}
        <Hint />
      </FloatingRootProvider>
    </OverlayI18nProvider>
  )
}
