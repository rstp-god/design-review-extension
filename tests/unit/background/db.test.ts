import 'fake-indexeddb/auto'
import { makeIssue, makeSession } from '@tests/fixtures/data'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDb,
  countSessions,
  deleteAllSessions,
  deleteSession,
  getBlob,
  getSession,
  getSessionByKey,
  getSessionSummaryByKey,
  listIssues,
  listSessionSummaries,
  listSessions,
  putBlob,
  putIssue,
  putSession,
  summarize,
} from '@/background/db'

describe('background db', () => {
  beforeEach(() => {
    // A fresh IndexedDB per test; the module reopens lazily.
    globalThis.indexedDB = new IDBFactory()
  })

  afterEach(async () => {
    await closeDb()
  })

  it('stores and finds sessions by id and by [scope, key]', async () => {
    const session = makeSession()
    await putSession(session)

    expect(await getSession(session.id)).toEqual(session)
    expect(await getSessionByKey('domain', 'https://shop.example.ru')).toEqual(session)
    expect(await getSessionByKey('page', 'https://shop.example.ru')).toBeUndefined()
    expect(await countSessions()).toBe(1)
  })

  it('keeps [scope, key] unique', async () => {
    await putSession(makeSession({ id: 'a' }))
    await expect(putSession(makeSession({ id: 'b' }))).rejects.toThrow()
    expect(await countSessions()).toBe(1)
  })

  it('lists sessions most recently updated first', async () => {
    await putSession(
      makeSession({ id: 'old', key: 'https://old.ru', updatedAt: '2026-01-01T00:00:00.000Z' }),
    )
    await putSession(
      makeSession({ id: 'new', key: 'https://new.ru', updatedAt: '2026-01-03T00:00:00.000Z' }),
    )
    await putSession(
      makeSession({ id: 'mid', key: 'https://mid.ru', updatedAt: '2026-01-02T00:00:00.000Z' }),
    )

    expect((await listSessions()).map((session) => session.id)).toEqual(['new', 'mid', 'old'])
  })

  it('summarizes issues per session: count, distinct pages, severity', async () => {
    const session = makeSession()
    await putSession(session)
    await putIssue(makeIssue({ number: 1, severity: 'blocker', pagePath: '/catalog' }))
    await putIssue(makeIssue({ number: 2, severity: 'major', pagePath: '/catalog' }))
    await putIssue(makeIssue({ number: 3, severity: 'minor', pagePath: '/cart' }))
    await putIssue(makeIssue({ number: 4, severity: 'minor', pagePath: '/cart/' }))

    const summary = await getSessionSummaryByKey('domain', session.key)
    expect(summary).toEqual({
      session,
      issueCount: 4,
      pageCount: 3,
      bySeverity: { blocker: 1, major: 1, minor: 2 },
    })
    expect(await getSessionSummaryByKey('domain', 'https://nope.ru')).toBeNull()
    expect(summarize(session, [])).toEqual({
      session,
      issueCount: 0,
      pageCount: 0,
      bySeverity: { blocker: 0, major: 0, minor: 0 },
    })
  })

  it('lists summaries for every session', async () => {
    await putSession(makeSession({ id: 'a', key: 'https://a.ru' }))
    await putSession(
      makeSession({ id: 'b', key: 'https://b.ru', updatedAt: '2026-02-01T00:00:00.000Z' }),
    )
    await putIssue(makeIssue({ number: 1, sessionId: 'b' }))

    const summaries = await listSessionSummaries()
    expect(summaries.map((summary) => [summary.session.id, summary.issueCount])).toEqual([
      ['b', 1],
      ['a', 0],
    ])
  })

  it('deletes a session with its issues and screenshots only', async () => {
    await putSession(makeSession({ id: 'a', key: 'https://a.ru' }))
    await putSession(makeSession({ id: 'b', key: 'https://b.ru' }))
    await putIssue(
      makeIssue({
        number: 1,
        sessionId: 'a',
        id: 'a-1',
        shots: { cropId: 'a-crop', viewportId: 'a-vp' },
      }),
    )
    await putIssue(
      makeIssue({
        number: 1,
        sessionId: 'b',
        id: 'b-1',
        shots: { cropId: 'b-crop', viewportId: 'b-vp' },
      }),
    )
    for (const id of ['a-crop', 'a-vp', 'b-crop', 'b-vp']) {
      await putBlob({ id, blob: new Blob([id], { type: 'text/plain' }) })
    }

    await deleteSession('a')

    expect(await getSession('a')).toBeUndefined()
    expect(await listIssues('a')).toEqual([])
    expect(await getBlob('a-crop')).toBeUndefined()
    expect(await getBlob('a-vp')).toBeUndefined()
    expect(await getSession('b')).toBeDefined()
    expect(await listIssues('b')).toHaveLength(1)
    expect(await getBlob('b-crop')).toBeDefined()
  })

  it('deleting a missing session is a no-op', async () => {
    await putSession(makeSession())
    await expect(deleteSession('ghost')).resolves.toBeUndefined()
    expect(await countSessions()).toBe(1)
  })

  it('deletes everything at once', async () => {
    await putSession(makeSession())
    await putIssue(makeIssue())
    await putBlob({ id: 'crop-1', blob: new Blob(['x']) })

    await deleteAllSessions()

    expect(await countSessions()).toBe(0)
    expect(await listIssues('session-shop')).toEqual([])
    expect(await getBlob('crop-1')).toBeUndefined()
  })
})
