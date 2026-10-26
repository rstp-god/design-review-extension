// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createOverlayHost, findOverlayHost } from '@/content/host'
import { OVERLAY_HOST_TAG } from '@/shared/constants'

const css =
  ':host{all:initial}\n@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}'

describe('overlay host', () => {
  afterEach(() => {
    for (const node of document.querySelectorAll(OVERLAY_HOST_TAG)) node.remove()
  })

  it('creates one custom element on <html> with an open shadow root and two containers', () => {
    expect(findOverlayHost()).toBeNull()
    const overlay = createOverlayHost(css)

    expect(overlay.host.tagName.toLowerCase()).toBe(OVERLAY_HOST_TAG)
    expect(overlay.host.parentElement).toBe(document.documentElement)
    expect(overlay.host.shadowRoot).toBe(overlay.shadowRoot)
    expect(overlay.app.id).toBe('dr-app')
    expect(overlay.floating.id).toBe('dr-floating')
    expect(findOverlayHost()).toBe(overlay.host)
  })

  it('attaches the CSS plus the --tw-* fallbacks inside the shadow root only', () => {
    const overlay = createOverlayHost(css)
    // jsdom has no constructed stylesheets: the <style> fallback is used and stays in the shadow tree.
    const style = overlay.shadowRoot.querySelector('style')
    expect(style?.textContent).toContain(':host{all:initial}')
    expect(style?.textContent).toContain('--tw-shadow:0 0 #0000')
    expect(document.head.querySelector('style')).toBeNull()
  })

  it('destroy removes everything from the document', () => {
    const overlay = createOverlayHost(css)
    overlay.destroy()
    expect(findOverlayHost()).toBeNull()
    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull()
  })
})
