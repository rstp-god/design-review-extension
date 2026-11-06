import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OverlayHost } from '@/content/host'
import type { Issue, Severity } from '@/shared/model'
import { FloatingRootProvider } from '@/ui'
import { IssuesPanel } from './IssuesPanel'
import { surfaceProps } from './surfaces'

/** Keep session data out of the inspected page's accessible DOM. */
export function PrivatePanel({
  host,
  onClose,
  onLocate,
  onChanged,
}: {
  host: OverlayHost
  onClose: () => void
  onLocate: (issue: Issue) => boolean
  onChanged: (id: string, severity: Severity | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const innerRoot = useRef<ShadowRoot | null>(null)
  const [roots, setRoots] = useState<{ app: HTMLElement; floating: HTMLElement } | null>(null)
  useLayoutEffect(() => {
    const node = container.current
    if (!node) return
    const shadow =
      innerRoot.current ??
      node.attachShadow({ mode: import.meta.env.VITE_E2E === '1' ? 'open' : 'closed' })
    innerRoot.current = shadow
    if ('adoptedStyleSheets' in shadow && host.shadowRoot.adoptedStyleSheets?.length) {
      shadow.adoptedStyleSheets = host.shadowRoot.adoptedStyleSheets
    } else {
      for (const style of host.shadowRoot.querySelectorAll('style'))
        shadow.append(style.cloneNode(true))
    }
    const app = document.createElement('div')
    const floating = document.createElement('div')
    app.className = 'dr-root'
    floating.className = 'dr-root'
    shadow.append(app, floating)
    setRoots({ app, floating })
    return () => {
      app.remove()
      floating.remove()
    }
  }, [host])
  return (
    <>
      <div
        ref={container}
        {...surfaceProps('issues-panel-host')}
        className="pointer-events-auto fixed top-0 right-0 z-20 h-full w-[380px] max-w-full"
      />
      {roots &&
        createPortal(
          <FloatingRootProvider container={roots.floating}>
            <IssuesPanel onClose={onClose} onLocate={onLocate} onChanged={onChanged} />
          </FloatingRootProvider>,
          roots.app,
        )}
    </>
  )
}
