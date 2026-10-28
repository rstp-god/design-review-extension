import { createMessageListener, type MessageHandlers } from '@/shared/messaging'
import { captureSenderTab } from './capture'
import {
  deleteAllSessions,
  deleteSession,
  getSessionSummaryByKey,
  listSessionSummaries,
} from './db'
import { startReview, stopReview } from './review'
import { getStorageUsage } from './storageUsage'

/** Background side of the wire contract. Payloads arrive validated; results are validated too. */
export const handlers: MessageHandlers = {
  'review/start': async ({ tabId }) => {
    await startReview(tabId)
    return { ok: true }
  },
  'review/stop': async ({ tabId }) => {
    await stopReview(tabId)
    return { ok: true }
  },
  'session/get': ({ scope, key }) => getSessionSummaryByKey(scope, key),
  'session/list': () => listSessionSummaries(),
  'session/delete': async ({ id }) => {
    await deleteSession(id)
    return { ok: true }
  },
  'session/deleteAll': async () => {
    await deleteAllSessions()
    return { ok: true }
  },
  'storage/usage': () => getStorageUsage(),
  'capture/visible': async (_payload, sender) => ({ dataUrl: await captureSenderTab(sender) }),
}

export const messageListener = createMessageListener(handlers)
