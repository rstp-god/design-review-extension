/** Product name. Not translated: it is the brand and is shown as-is in every locale. */
export const APP_NAME = 'Design Review'

/**
 * Output name of the content script bundle (built by vite.content.config.ts). The background
 * injects it with `chrome.scripting.executeScript`; it is a plain file of the extension package,
 * so it needs no `web_accessible_resources`.
 */
export const CONTENT_SCRIPT_FILE = 'content.js'

/** `chrome.commands` id of the global start / stop hotkey (manifest.config.ts). */
export const TOGGLE_REVIEW_COMMAND = 'toggle-review'

/** Tag name of the overlay host element. Custom tag: host-page CSS never targets it. */
export const OVERLAY_HOST_TAG = 'dr-overlay'

/** `chrome.storage.local` key holding the toolbar position and collapsed flag (per device). */
export const TOOLBAR_STATE_KEY = 'toolbarState'

/** `chrome.storage.sync` key of the settings envelope. */
export const SETTINGS_KEY = 'settings'

/** Default toolbar offset from the top-right corner of the viewport, px. */
export const TOOLBAR_DEFAULT_INSET = 16

/** Page URL used by the popup to open Chrome's shortcut editor (a plain link is not allowed). */
export const SHORTCUTS_PAGE_URL = 'chrome://extensions/shortcuts'
