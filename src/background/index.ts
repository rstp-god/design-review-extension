/**
 * MV3 background service worker.
 *
 * Intentionally empty at this stage. Listeners (commands, messages, content script injection)
 * arrive with `feature/extension-shell` and must be registered synchronously at the top level of
 * this file: a listener attached behind an `await` misses the event that woke a cold worker.
 */
export {}
