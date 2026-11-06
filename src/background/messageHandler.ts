import { createMessageListener, type MessageHandlers } from '@/shared/messaging'
import { normalizePath } from '@/shared/sessionKey'
import { captureSenderTab } from './capture'
import {
  createIssue,
  deleteAllSessions,
  deleteSession,
  getSessionSummaryByKey,
  listSessionSummaries,
} from './db'
import { startReview, stopReview } from './review'
import { getStorageUsage } from './storageUsage'

function decodeWebp(dataUrl: string): Blob {
  const payload = dataUrl.slice('data:image/webp;base64,'.length)
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) {
    throw new Error('Invalid image encoding')
  }
  const binary = atob(payload)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  if (binary.slice(0, 4) !== 'RIFF' || binary.slice(8, 12) !== 'WEBP') {
    throw new Error('Invalid WebP image')
  }
  return new Blob([bytes], { type: 'image/webp' })
}

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
  'issue/create': async (payload, sender) => {
    if (sender.tab?.id === undefined || sender.frameId !== 0 || !sender.url) {
      throw new Error('issue/create must come from the top frame of a tab')
    }
    const origin = new URL(sender.url)
    const page = new URL(payload.draft.pageUrl)
    if (
      origin.origin !== page.origin ||
      normalizePath(origin.pathname) !== payload.draft.pagePath ||
      normalizePath(page.pathname) !== payload.draft.pagePath
    ) {
      throw new Error('Issue page does not match the sender')
    }
    return createIssue(payload, decodeWebp(payload.crop), decodeWebp(payload.viewport))
  },
}

export const messageListener = createMessageListener(handlers)
