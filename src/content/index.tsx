import overlayCss from '@/styles/overlay.css?inline'
import { createOverlayHost, findOverlayHost } from './host'

/**
 * Content script entry (built to `content.js` by vite.content.config.ts). Idempotent: a second
 * injection into the same document finds the existing host and does nothing.
 *
 * Temporary: the React overlay, hotkeys and teardown land in the content step of
 * feature/extension-shell.
 */
if (!findOverlayHost()) {
  createOverlayHost(overlayCss)
}
