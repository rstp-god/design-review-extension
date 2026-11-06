import { flip, offset, shift, useFloating } from '@floating-ui/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { rectReference } from '@/content/overlay/rectReference'
import { useOverlayStore } from '@/content/store/overlay'
import { resolveTheme } from '@/content/theme'
import { connectRuntime, extensionUrl } from '@/services/chrome/runtime'
import { ISSUE_FORM_PORT, issueFormPortSchema } from '@/shared/messaging'
import type { Severity } from '@/shared/model'
import { useSettingsStore } from '@/store/settings'
import type { IssueSelection } from './selection'

/** The iframe is cross-origin to the site; the one-time capability never appears in the DOM. */
export function IssueFrame({
  selection,
  onCancel,
  onSave,
  initial,
}: {
  selection: IssueSelection & { operationId: string }
  onCancel: () => void
  onSave: (text: string, severity: Severity) => Promise<void>
  initial?: { text: string; severity: Severity }
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const token = useRef(crypto.randomUUID())
  const handlers = useRef({ onCancel, onSave })
  handlers.current = { onCancel, onSave }
  const [ready, setReady] = useState(false)
  const reference = useMemo(() => rectReference(selection.target.rect), [selection])
  const { refs, floatingStyles } = useFloating({
    open: true,
    placement: 'bottom-start',
    middleware: [offset(12), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  useLayoutEffect(() => {
    refs.setPositionReference(reference)
  }, [refs, reference])
  useEffect(() => {
    const connection = connectRuntime(ISSUE_FORM_PORT)
    let disposed = false
    connection.onDisconnect.addListener(() => {
      if (disposed) return
      useOverlayStore.getState().showToast('issue.failed')
      handlers.current.onCancel()
    })
    connection.onMessage.addListener((raw: unknown) => {
      const parsed = issueFormPortSchema.safeParse(raw)
      if (!parsed.success) return
      const message = parsed.data
      if (message.type === 'registered') setReady(true)
      if (message.type === 'cancel') handlers.current.onCancel()
      if (message.type === 'submit') {
        void handlers.current
          .onSave(message.text, message.severity)
          .then(() => {
            if (!disposed) connection.postMessage({ type: 'result', ok: true })
          })
          .catch(() => {
            if (!disposed) connection.postMessage({ type: 'result', ok: false })
          })
      }
    })
    connection.postMessage({
      type: 'register',
      token: token.current,
      severity: initial?.severity ?? useSettingsStore.getState().defaultSeverity,
      text: initial?.text,
      theme: resolveTheme(
        useSettingsStore.getState().theme,
        window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false,
      ),
      styles: selection.styles,
    })
    const timer = window.setInterval(() => {
      if (selection.element)
        connection.postMessage({ type: 'missing', value: !selection.element.isConnected })
    }, 250)
    // Messages keep an MV3 worker awake while the user is writing in the isolated frame.
    const heartbeat = window.setInterval(
      () => connection.postMessage({ type: 'heartbeat' }),
      20_000,
    )
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.clearInterval(heartbeat)
      connection.disconnect()
    }
  }, [selection, initial])
  const src = extensionUrl('src/issue/index.html')
  useEffect(() => {
    const onReady = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'dr-form-ready')
        return
      frame.current?.contentWindow?.postMessage(
        { type: 'dr-form-init', token: token.current },
        `chrome-extension://${new URL(src).host}`,
      )
    }
    window.addEventListener('message', onReady)
    return () => window.removeEventListener('message', onReady)
  }, [src])
  return (
    <iframe
      ref={(element) => {
        frame.current = element
        refs.setFloating(element)
      }}
      title="Design Review"
      data-testid="issue-frame"
      src={ready ? src : undefined}
      onLoad={() => {
        if (ready)
          frame.current?.contentWindow?.postMessage(
            { type: 'dr-form-init', token: token.current },
            `chrome-extension://${new URL(src).host}`,
          )
      }}
      style={{
        ...floatingStyles,
        width: 340,
        height: 420,
        border: 0,
        zIndex: 30,
        colorScheme: 'normal',
      }}
    />
  )
}
