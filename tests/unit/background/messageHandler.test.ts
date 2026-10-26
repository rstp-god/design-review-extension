import 'fake-indexeddb/auto'
import { makeIssue, makeSession } from '@tests/fixtures/data'
import { type ChromeMock, installChromeMock, mockTab } from '@tests/mocks/chrome'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, countSessions, putIssue, putSession } from '@/background/db'
import { messageListener } from '@/background/messageHandler'
import { sendToBackground } from '@/shared/messaging'

describe('background message handler', () => {
  let mock: ChromeMock

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    mock = installChromeMock()
    mock.runtime.onMessage.addListener(messageListener)
  })

  afterEach(async () => {
    await closeDb()
  })

  it('answers session/get, session/list and storage/usage from the database', async () => {
    const session = makeSession()
    await putSession(session)
    await putIssue(makeIssue({ number: 1, severity: 'blocker' }))

    await expect(
      sendToBackground('session/get', { scope: 'domain', key: session.key }),
    ).resolves.toEqual({
      session,
      issueCount: 1,
      pageCount: 1,
      bySeverity: { blocker: 1, major: 0, minor: 0 },
    })
    await expect(
      sendToBackground('session/get', { scope: 'page', key: session.key }),
    ).resolves.toBeNull()
    await expect(sendToBackground('session/list', {})).resolves.toHaveLength(1)
    await expect(sendToBackground('storage/usage', {})).resolves.toEqual({ bytes: 0, sessions: 1 })
  })

  it('deletes one session or all of them', async () => {
    await putSession(makeSession({ id: 'a', key: 'https://a.ru' }))
    await putSession(makeSession({ id: 'b', key: 'https://b.ru' }))

    await expect(sendToBackground('session/delete', { id: 'a' })).resolves.toEqual({ ok: true })
    expect(await countSessions()).toBe(1)

    await expect(sendToBackground('session/deleteAll', {})).resolves.toEqual({ ok: true })
    expect(await countSessions()).toBe(0)
  })

  it('starts a review on the requested tab', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: 3, url: 'https://shop.example.ru/' }))
    mock.tabs.sendMessage.mockImplementation(async (_tabId, message) => {
      const { type } = message as { type: string }
      if (type === 'review/status') throw new Error('Receiving end does not exist.')
      return { ok: true, data: { ok: true } }
    })

    await expect(sendToBackground('review/start', { tabId: 3 })).resolves.toEqual({ ok: true })
    expect(mock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 3 }, files: ['content.js'] }),
    )
  })

  it('reports a restricted page as a failed handler', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: 3, url: 'chrome://settings/' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(sendToBackground('review/start', { tabId: 3 })).rejects.toMatchObject({
      code: 'handler-failed',
    })
    expect(warn).not.toHaveBeenCalled()
  })
})
