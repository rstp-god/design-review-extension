import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createI18n } from '@/i18n'
import { onRuntimeMessage } from '@/services/chrome/runtime'
import { createMessageListener } from '@/shared/messaging'
import overlayCss from '@/styles/overlay.css?inline'
import { createOverlayHost, findOverlayHost } from './host'
import { App } from './overlay/App'
import { useOverlayStore } from './store/overlay'

/**
 * Content script entry, built to `content.js` (vite.content.config.ts) and injected on demand by
 * the background. Everything we add to the page lives in one shadow root; `dispose()` removes
 * it all — DOM, React, listeners — so leaving the review leaves nothing behind.
 *
 * Idempotent: a second injection into a document that already has our host does nothing. The
 * instance that created the host keeps answering `review/*` messages for it.
 */
function mount(): void {
  const host = createOverlayHost(overlayCss)
  const i18n = createI18n()
  const root = createRoot(host.app)
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    root.unmount()
    host.destroy()
    useOverlayStore.getState().setSession(null)
  }

  const unsubscribe = onRuntimeMessage(
    createMessageListener({
      'review/open': ({ session }) => {
        useOverlayStore.getState().setSession(session)
        return { ok: true }
      },
      'review/status': () => ({ active: !disposed }),
      'review/close': () => {
        dispose()
        return { ok: true }
      },
    }),
  )

  root.render(
    <StrictMode>
      <App host={host} i18n={i18n} onExit={dispose} />
    </StrictMode>,
  )
}

if (!findOverlayHost()) {
  mount()
}
