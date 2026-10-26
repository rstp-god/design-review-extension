import type { i18n as I18n } from 'i18next'
import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import type { OverlayHost } from '@/content/host'
import { installHotkeys } from '@/content/hotkeys'
import { watchLocation } from '@/content/spaNavigation'
import { useOverlayStore } from '@/content/store/overlay'
import { applyTheme } from '@/content/theme'
import { normalizePath } from '@/shared/sessionKey'
import { useSettingsStore } from '@/store/settings'
import { FloatingRootProvider } from '@/ui'
import { Hint } from './Hint'
import { Toolbar } from './Toolbar'

export interface AppProps {
  host: OverlayHost
  i18n: I18n
  onExit: () => void
}

/** Root of the overlay: providers, theme, hotkeys, SPA tracking, then the toolbar and the hint. */
export function App({ host, i18n, onExit }: AppProps) {
  const theme = useSettingsStore((state) => state.theme)
  const setPagePath = useOverlayStore((state) => state.setPagePath)

  useEffect(() => applyTheme(host.host, theme), [host, theme])

  useEffect(() => installHotkeys([{ key: 'Escape', handler: onExit }]), [onExit])

  useEffect(() => {
    setPagePath(normalizePath(window.location.pathname))
    return watchLocation(({ pathname }) => setPagePath(pathname))
  }, [setPagePath])

  return (
    <I18nextProvider i18n={i18n}>
      <FloatingRootProvider container={host.floating}>
        <Toolbar onExit={onExit} />
        <Hint />
      </FloatingRootProvider>
    </I18nextProvider>
  )
}
