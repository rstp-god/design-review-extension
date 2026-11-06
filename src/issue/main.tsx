import '@/styles/overlay.css'
import { TestId } from '@tests/constants/testIds'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { OverlayI18nProvider, useT } from '@/content/i18n'
import { resolveLanguage } from '@/i18n/resolveLanguage'
import { getUILanguage } from '@/services/chrome/i18n'
import { connectRuntime } from '@/services/chrome/runtime'
import { ISSUE_FORM_PORT, type IssueFormPortMessage, issueFormPortSchema } from '@/shared/messaging'
import type { Severity } from '@/shared/model'
import { isTrustedEvent, onlyTrusted } from '@/shared/trustedEvents'
import { Button } from '@/ui'

type Config = Extract<IssueFormPortMessage, { type: 'config' }>

function Form() {
  const t = useT('overlay')
  const [config, setConfig] = useState<Config | null>(null)
  const [severity, setSeverity] = useState<Severity>('major')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [missing, setMissing] = useState(false)
  const port = useRef<chrome.runtime.Port | null>(null)
  const initialized = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const onInit = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        !event.data ||
        event.data.type !== 'dr-form-init' ||
        typeof event.data.token !== 'string' ||
        initialized.current
      )
        return
      const connection = connectRuntime(ISSUE_FORM_PORT)
      connection.onMessage.addListener((raw: unknown) => {
        const parsed = issueFormPortSchema.safeParse(raw)
        if (!parsed.success) return
        const message = parsed.data
        if (message.type === 'config') {
          port.current?.disconnect()
          port.current = connection
          initialized.current = true
          setConfig(message)
          setSeverity(message.severity)
          document.documentElement.dataset.theme = message.theme
        }
        if (connection !== port.current) return
        if (message.type === 'result' && !message.ok) {
          setBusy(false)
          setFailed(true)
        }
        if (message.type === 'missing') setMissing(message.value)
      })
      connection.onDisconnect.addListener(() => {
        if (connection === port.current) {
          setBusy(false)
          setFailed(true)
        }
      })
      connection.postMessage({ type: 'claim', token: event.data.token })
    }
    window.addEventListener('message', onInit)
    window.parent.postMessage({ type: 'dr-form-ready' }, '*')
    return () => {
      window.removeEventListener('message', onInit)
      port.current?.disconnect()
    }
  }, [])
  useEffect(() => {
    if (config) input.current?.focus()
  }, [config])
  const cancel = () => {
    if (!busy) port.current?.postMessage({ type: 'cancel' })
  }
  const save = () => {
    if (!text.trim() || busy || !port.current) return
    setBusy(true)
    setFailed(false)
    port.current.postMessage({ type: 'submit', text: text.trim(), severity })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTrustedEvent(event)) {
        event.preventDefault()
        cancel()
      }
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.isComposing &&
        isTrustedEvent(event)
      ) {
        event.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (!config) return null
  return (
    <div
      data-testid={TestId.IssueForm}
      role="dialog"
      aria-label={t('issue.title')}
      className="dr-root rounded-xl border border-border bg-bg p-6 text-fg shadow-popover"
    >
      <div className="mb-4 font-semibold">{t('issue.title')}</div>
      {missing && <p role="status">{t('issue.missing')}</p>}
      <label className="block">
        {t('issue.severity')}
        <select
          data-testid={TestId.IssueSeverity}
          value={severity}
          onChange={(event) => setSeverity(event.target.value as Severity)}
          className="mt-2 block w-full rounded-md border border-border bg-bg p-2 text-fg"
        >
          {(['blocker', 'major', 'minor'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`issue.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block">
        {t('issue.text')}
        <textarea
          ref={input}
          data-testid={TestId.IssueText}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="mt-2 block min-h-[90px] w-full rounded-md border border-border bg-bg p-2 text-fg"
        />
      </label>
      {config.styles && (
        <details data-testid={TestId.IssueStyles} className="mt-4">
          <summary>{t('issue.styles')}</summary>
          <dl>
            {Object.entries(config.styles).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {failed && <p role="alert">{t('issue.failed')}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <Button data-testid={TestId.IssueCancel} disabled={busy} onClick={onlyTrusted(cancel)}>
          {t('issue.cancel')}
        </Button>
        <Button
          data-testid={TestId.IssueSave}
          variant="primary"
          disabled={busy || !text.trim()}
          onClick={onlyTrusted(save)}
        >
          {t('issue.save')}
        </Button>
      </div>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Issue form root missing')
createRoot(root).render(
  <OverlayI18nProvider language={resolveLanguage(getUILanguage())}>
    <Form />
  </OverlayI18nProvider>,
)
