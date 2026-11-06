import { TestId } from '@tests/constants/testIds'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AreaSelect } from '@/content/area/AreaSelect'
import { prepareShots } from '@/content/crop'
import { createE2EDebug } from '@/content/e2eDebug'
import type { OverlayHost } from '@/content/host'
import { installHotkeys } from '@/content/hotkeys'
import { OverlayI18nProvider, useT } from '@/content/i18n'
import { IssueFrame } from '@/content/issue/IssueFrame'
import type { IssueSelection } from '@/content/issue/selection'
import { createLiveSource } from '@/content/picker/live'
import { Picker } from '@/content/picker/Picker'
import { captureCleanBitmap } from '@/content/snapshot/capture'
import {
  type SnapshotController,
  useSnapshotController,
} from '@/content/snapshot/useSnapshotController'
import { locationWatchStrategy, watchLocation } from '@/content/spaNavigation'
import { useOverlayStore } from '@/content/store/overlay'
import { applyTheme } from '@/content/theme'
import type { UiLanguage } from '@/i18n/resolveLanguage'
import { MessageError, type ResponseOf, sendToBackground } from '@/shared/messaging'
import type { Rect, Severity } from '@/shared/model'
import { normalizePath, sessionKey } from '@/shared/sessionKey'
import { useSettingsStore } from '@/store/settings'
import { FloatingRootProvider } from '@/ui'
import { Countdown } from './Countdown'
import { Hint } from './Hint'
import { PrivatePanel } from './PrivatePanel'
import { SnapshotBadge } from './SnapshotBadge'
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
  const t = useT('overlay')
  const setPagePath = useOverlayStore((state) => state.setPagePath)
  const tool = useOverlayStore((state) => state.tool)
  const phase = useOverlayStore((state) => state.snapshotPhase)
  const liveSource = useMemo(() => createLiveSource({ host: host.host }), [host])
  const snapshot = useSnapshotController(host)
  const [selection, setSelection] = useState<
    (IssueSelection & { operationId: string; url: string }) | null
  >(null)
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const lastRect = useRef<Rect | null>(null)
  const saving = useRef(false)
  const [markers, setMarkers] = useState<
    Array<{
      id: string
      number: number
      severity: Severity
      path: string
      sessionId: string
      rect: Rect
      scroll: { x: number; y: number }
      element?: Element
      frozen: boolean
    }>
  >([])
  const [layout, setLayout] = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)
  const [highlight, setHighlight] = useState<Rect | null>(null)
  const panelRef = useRef(false)
  panelRef.current = panelOpen
  const navigationSequence = useRef(0)
  // The tools never know which page they read: live or frozen, the interface is the same.
  const source = snapshot.source ?? liveSource

  useEffect(() => () => liveSource.dispose(), [liveSource])

  useEffect(
    () =>
      installHotkeys([
        {
          key: 'Escape',
          when: () => !panelRef.current,
          handler: () => {
            if (selectionRef.current) {
              if (saving.current) return
              setSelection(null)
              return
            }
            stepBack(onExit, snapshot)
          },
        },
        {
          key: 'p',
          code: 'KeyP',
          when: () => !selectionRef.current,
          handler: () => {
            if (!selectionRef.current) useOverlayStore.getState().togglePicker()
          },
        },
        {
          key: 'a',
          code: 'KeyA',
          when: () => !selectionRef.current,
          handler: () => {
            if (!selectionRef.current) useOverlayStore.getState().toggleArea()
          },
        },
        {
          key: 'f',
          code: 'KeyF',
          when: () => !selectionRef.current,
          handler: () => {
            if (!selectionRef.current) snapshot.toggle()
          },
        },
        {
          key: 'f',
          code: 'KeyF',
          shift: true,
          when: () => !selectionRef.current,
          handler: () => {
            if (!selectionRef.current) snapshot.startCountdown()
          },
        },
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
    return watchLocation(({ pathname, url }) => {
      update(pathname)
      setSelection(null)
      if (useOverlayStore.getState().snapshotPhase === 'snapshot') snapshot.exit()
      const sequence = ++navigationSequence.current
      const current = useOverlayStore.getState().session
      const scope = current?.session.scope ?? useSettingsStore.getState().sessionScope
      if (scope === 'domain') return
      useOverlayStore.getState().setSession(null)
      void sendToBackground('session/get', { scope, key: sessionKey(url, scope) })
        .then((session) => {
          if (sequence === navigationSequence.current)
            useOverlayStore.getState().setSession(session)
        })
        .catch(() => useOverlayStore.getState().showToast('issue.failed'))
    })
  }, [host, setPagePath, snapshot.exit])

  useEffect(() => {
    const update = () => setLayout((value) => value + 1)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [])

  const openIssue = useCallback((value: IssueSelection) => {
    lastRect.current = value.target.rect
    setSelection({ ...value, operationId: crypto.randomUUID(), url: window.location.href })
  }, [])

  useEffect(() => {
    if (!selection?.element || snapshot.snapshot) return
    let frame = 0
    const measure = () => {
      if (selection.element?.isConnected) {
        const rect = selection.element.getBoundingClientRect()
        lastRect.current = { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      }
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [selection, snapshot.snapshot])

  const saveIssue = useCallback(
    async (text: string, severity: Severity) => {
      if (!selection) return
      const selected = selection
      const path = normalizePath(new URL(selected.url).pathname)
      const ensurePage = () => {
        if (
          normalizePath(location.pathname) !== path ||
          location.origin !== new URL(selected.url).origin
        )
          throw new Error('Page changed')
      }
      ensurePage()
      const settings = useSettingsStore.getState()
      const scope = useOverlayStore.getState().session?.session.scope ?? settings.sessionScope
      const frozen = snapshot.snapshot
      const view = frozen?.viewport ?? { w: window.innerWidth, h: window.innerHeight }
      const scroll = frozen?.scroll ?? { x: window.scrollX, y: window.scrollY }
      const rect =
        selected.element?.isConnected && !frozen
          ? (() => {
              const r = selected.element.getBoundingClientRect()
              return { x: r.x, y: r.y, w: r.width, h: r.height }
            })()
          : (lastRect.current ?? selected.target.rect)
      const bitmap = frozen
        ? await createImageBitmap(frozen.bitmap)
        : await captureCleanBitmap(host.host)
      try {
        ensurePage()
        if (!frozen && (view.w !== window.innerWidth || view.h !== window.innerHeight))
          throw new Error('Viewport changed')
        const current = await sendToBackground('session/get', {
          scope,
          key: sessionKey(selected.url, scope),
        })
        let number = current?.session.nextNumber ?? 1
        const draft = {
          pageUrl: selected.url,
          pagePath: path,
          pageTitle: document.title,
          env: {
            viewport: view,
            dpr: frozen?.dpr ?? window.devicePixelRatio,
            userAgent: navigator.userAgent,
          },
          severity,
          text,
          target: { ...selected.target, rect },
          source: frozen ? ('snapshot' as const) : ('live' as const),
          ...(frozen ? { snapshotAt: new Date(frozen.takenAt).toISOString() } : {}),
          scroll,
          styles: selected.styles,
        }
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const shots = await prepareShots(
            bitmap,
            view,
            rect,
            settings.cropPadding,
            settings.shotQuality,
            number,
          )
          ensurePage()
          const payload = {
            operationId: selected.operationId,
            scope,
            expectedNumber: number,
            draft: { ...draft, clipped: shots.clipped },
            crop: shots.crop,
            viewport: shots.viewport,
          }
          let result: ResponseOf<'issue/create'>
          try {
            result = await sendToBackground('issue/create', payload)
          } catch (error) {
            if (!(error instanceof MessageError) || error.code !== 'timeout') throw error
            result = await sendToBackground('issue/create', payload)
          }
          if (result.status === 'conflict') {
            number = result.nextNumber
            continue
          }
          if (sessionKey(location.href, scope) === result.summary.session.key) {
            useOverlayStore.getState().setSession(result.summary)
          }
          setMarkers((previous) => [
            ...previous,
            {
              id: result.issue.id,
              number: result.issue.number,
              severity: result.issue.severity,
              sessionId: result.issue.sessionId,
              path,
              rect,
              scroll,
              element: selected.element,
              frozen: Boolean(frozen),
            },
          ])
          setSelection((currentSelection) =>
            currentSelection?.operationId === selected.operationId ? null : currentSelection,
          )
          return
        }
        throw new Error('Concurrent issue creation')
      } finally {
        bitmap.close()
      }
    },
    [selection, snapshot.snapshot, host],
  )

  const activeSession = useOverlayStore((state) => state.session?.session.id)
  const pagePath = useOverlayStore((state) => state.pagePath)
  void layout

  return (
    <>
      {snapshot.snapshot && <SnapshotLayer snapshot={snapshot.snapshot} />}
      {markers
        .filter((marker) => marker.path === pagePath && marker.sessionId === activeSession)
        .map((marker) => {
          const rect =
            marker.element?.isConnected && !marker.frozen
              ? marker.element.getBoundingClientRect()
              : null
          const fixedToSnapshot = marker.frozen && phase === 'snapshot'
          const x =
            rect?.x ?? marker.rect.x + (fixedToSnapshot ? 0 : marker.scroll.x - window.scrollX)
          const y =
            rect?.y ?? marker.rect.y + (fixedToSnapshot ? 0 : marker.scroll.y - window.scrollY)
          return (
            <span
              key={marker.id}
              data-testid={TestId.IssueMarker}
              role="img"
              aria-label={`${marker.number} ${t(`issue.${marker.severity}`)}`}
              className={`pointer-events-none fixed z-10 px-2 text-[#111827] ${marker.severity === 'blocker' ? 'rounded-pill bg-blocker' : marker.severity === 'major' ? 'rounded-md bg-major' : 'rounded-none bg-minor'}`}
              style={{ left: x, top: y }}
            >
              {marker.number}
            </span>
          )
        })}
      <div inert={Boolean(selection)}>
        <Toolbar
          onExit={onExit}
          snapshot={snapshot}
          issuesOpen={panelOpen}
          onIssues={() => setPanelOpen((open) => !open)}
        />
      </div>
      {panelOpen && (
        <PrivatePanel
          host={host}
          onClose={() => {
            setPanelOpen(false)
            host.shadowRoot
              .querySelector<HTMLButtonElement>('[data-testid="toolbar-issues"]')
              ?.focus()
          }}
          onLocate={(issue) => {
            const marker = markers.find(
              (item) =>
                item.id === issue.id && item.sessionId === activeSession && item.path === pagePath,
            )
            if (!marker?.element?.isConnected || marker.frozen || phase === 'snapshot') return false
            marker.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            window.setTimeout(() => {
              if (!marker.element?.isConnected) return
              const r = marker.element.getBoundingClientRect()
              setHighlight({ x: r.x, y: r.y, w: r.width, h: r.height })
              window.setTimeout(() => setHighlight(null), 1800)
            }, 350)
            return true
          }}
          onChanged={(id, severity) =>
            setMarkers((previous) =>
              severity
                ? previous.map((item) => (item.id === id ? { ...item, severity } : item))
                : previous.filter((item) => item.id !== id),
            )
          }
        />
      )}
      {highlight && (
        <div
          aria-hidden="true"
          data-testid={TestId.IssueHighlight}
          className="pointer-events-none fixed z-10 border-2 border-accent"
          style={{ left: highlight.x, top: highlight.y, width: highlight.w, height: highlight.h }}
        />
      )}
      {tool === 'picker' && (
        <Picker host={host} source={source} onIssue={selection ? undefined : openIssue} />
      )}
      {tool === 'area' && (
        <AreaSelect host={host} source={source} onIssue={selection ? undefined : openIssue} />
      )}
      {selection && (
        <IssueFrame
          selection={selection}
          onCancel={() => setSelection(null)}
          onSave={async (text, severity) => {
            saving.current = true
            try {
              await saveIssue(text, severity)
            } finally {
              saving.current = false
            }
          }}
        />
      )}
      {phase === 'countdown' && <Countdown />}
      {phase === 'snapshot' && <SnapshotBadge />}
      <Hint />
      <Toast />
    </>
  )
}
