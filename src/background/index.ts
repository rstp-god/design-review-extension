import { onCommand } from '@/services/chrome/commands'
import { onRuntimeMessage } from '@/services/chrome/runtime'
import { handleCommand } from './commands'
import { messageListener } from './messageHandler'

/**
 * MV3 background service worker. Only listener registration lives here, synchronously at the
 * top level: a listener attached behind an `await` misses the event that woke a cold worker.
 * Logic is in messageHandler.ts, review.ts, inject.ts, commands.ts and db.ts.
 */
onRuntimeMessage(messageListener)
onCommand((command, tab) => {
  void handleCommand(command, tab)
})

// Dead code in the production build: Vite inlines the constant and Rollup drops the branch, so
// `e2e.ts` and its `__drE2E` hook never reach `dist/` (checked by a contract test).
if (import.meta.env.VITE_E2E === '1') {
  void import('./e2e')
}
