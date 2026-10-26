import { OVERLAY_HOST_TAG } from '@/shared/constants'
import { buildTwPropertyFallbacks } from './styles/twFallbacks'

/** The overlay's foothold on the host page: one custom element with an open shadow root. */
export interface OverlayHost {
  host: HTMLElement
  shadowRoot: ShadowRoot
  /** React root container. */
  app: HTMLElement
  /** Portal target for menus, tooltips and dialogs — inside the shadow root, never `body`. */
  floating: HTMLElement
  destroy: () => void
}

export function findOverlayHost(doc: Document = document): HTMLElement | null {
  return doc.querySelector(OVERLAY_HOST_TAG)
}

/**
 * Creates the host element, attaches the compiled overlay CSS and appends the host to
 * `<html>` (not `<body>`: some sites replace their body on navigation).
 *
 * Styles go through `adoptedStyleSheets`, which the page's CSP cannot block and which never adds
 * a `<style>` or `<link>` to the document. The `<style>` branch exists only for environments
 * without constructed stylesheets (jsdom in unit tests).
 */
export function createOverlayHost(css: string, doc: Document = document): OverlayHost {
  const host = doc.createElement(OVERLAY_HOST_TAG)
  const shadowRoot = host.attachShadow({ mode: 'open' })
  attachStyles(shadowRoot, `${css}\n${buildTwPropertyFallbacks(css)}`)

  const app = doc.createElement('div')
  app.id = 'dr-app'
  app.className = 'dr-root'

  const floating = doc.createElement('div')
  floating.id = 'dr-floating'
  floating.className = 'dr-root'

  shadowRoot.append(app, floating)
  doc.documentElement.append(host)

  return {
    host,
    shadowRoot,
    app,
    floating,
    destroy: () => host.remove(),
  }
}

function supportsConstructedStyleSheets(root: ShadowRoot): boolean {
  return (
    'adoptedStyleSheets' in root &&
    typeof CSSStyleSheet !== 'undefined' &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function'
  )
}

function attachStyles(root: ShadowRoot, css: string): void {
  if (supportsConstructedStyleSheets(root)) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    root.adoptedStyleSheets = [sheet]
    return
  }

  const style = root.ownerDocument.createElement('style')
  style.textContent = css
  root.append(style)
}
