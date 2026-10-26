import { onCommand } from '@/services/chrome/commands'
import { onRuntimeMessage } from '@/services/chrome/runtime'
import { handleCommand } from './commands'
import { installE2EHooks } from './e2e'
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

// Dead code in the production build: Vite inlines the constant, the call is dropped and with it
// the whole e2e module, so `__drE2E` never reaches `dist/` (checked by a contract test).
if (import.meta.env.VITE_E2E === '1') {
  installE2EHooks()
}
