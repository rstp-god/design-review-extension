import 'fake-indexeddb/auto'
import { makeIssue, makeSession } from '@tests/fixtures/data'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeDb,
  countSessions,
  createIssue,
  deleteAllSessions,
  deleteIssue,
  deleteSession,
  getBlob,
  getDb,
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
  updateIssue,
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

  it('edits only allowed fields and removes both images without reusing numbers', async () => {
    const session = makeSession({ nextNumber: 8 })
    const issue = makeIssue()
    await putSession(session)
    await putIssue(issue)
    await putBlob({ id: issue.shots.cropId, blob: new Blob(['crop']) })
    await putBlob({ id: issue.shots.viewportId, blob: new Blob(['viewport']) })
    await expect(updateIssue('other', issue.id, 'bad', 'blocker')).rejects.toThrow()
    await updateIssue(session.id, issue.id, 'Revised', 'minor')
    const [edited] = await listIssues(session.id)
    expect(edited).toMatchObject({
      ...issue,
      text: 'Revised',
      severity: 'minor',
      updatedAt: expect.any(String),
    })
    expect(edited.shots).toEqual(issue.shots)
    await expect(deleteIssue('other', issue.id)).rejects.toThrow()
    await deleteIssue(session.id, issue.id)
    expect(await listIssues(session.id)).toEqual([])
    expect(await getBlob(issue.shots.cropId)).toBeUndefined()
    expect(await getBlob(issue.shots.viewportId)).toBeUndefined()
    expect((await getSession(session.id))?.nextNumber).toBe(8)
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

  it('creates the session, issue and images atomically and never reuses a number', async () => {
    const sample = makeIssue()
    const request = {
      operationId: 'operation-1',
      scope: 'domain' as const,
      expectedNumber: 1,
      draft: {
        pageUrl: sample.pageUrl,
        pagePath: sample.pagePath,
        pageTitle: sample.pageTitle,
        env: sample.env,
        severity: sample.severity,
        text: sample.text,
        target: sample.target,
        source: sample.source,
        scroll: sample.scroll,
      },
      crop: 'data:image/webp;base64,',
      viewport: 'data:image/webp;base64,',
    }
    const image = new Blob(['image'], { type: 'image/webp' })
    const first = await createIssue(request, image, image)
    expect(first.status).toBe('created')
    if (first.status !== 'created') throw new Error('expected issue')
    expect(first.issue.number).toBe(1)
    expect(await getBlob(first.issue.shots.cropId)).toBeDefined()
    expect(await getBlob(first.issue.shots.viewportId)).toBeDefined()
    expect(await createIssue(request, image, image)).toEqual(first)
    await (await getDb()).delete('issues', first.issue.id)
    expect(await createIssue({ ...request, operationId: 'operation-2' }, image, image)).toEqual({
      status: 'conflict',
      nextNumber: 2,
    })
    const second = await createIssue(
      { ...request, operationId: 'operation-2', expectedNumber: 2 },
      image,
      image,
    )
    expect(second.status === 'created' && second.issue.number).toBe(2)
  })

  it('serializes competing requests and rolls back all writes on a blob constraint error', async () => {
    const sample = makeIssue()
    const draft = {
      pageUrl: sample.pageUrl,
      pagePath: sample.pagePath,
      pageTitle: sample.pageTitle,
      env: sample.env,
      severity: sample.severity,
      text: sample.text,
      target: sample.target,
      source: sample.source,
      scroll: sample.scroll,
    }
    const request = {
      operationId: 'a',
      scope: 'domain' as const,
      expectedNumber: 1,
      draft,
      crop: 'data:image/webp;base64,',
      viewport: 'data:image/webp;base64,',
    }
    const image = new Blob(['image'], { type: 'image/webp' })
    const results = await Promise.all([
      createIssue(request, image, image),
      createIssue({ ...request, operationId: 'b' }, image, image),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'created'])
    const session = await getSessionByKey('domain', 'https://shop.example.ru')
    expect(session?.nextNumber).toBe(2)
    const duplicate = '00000000-0000-4000-8000-000000000001'
    await putBlob({ id: duplicate, blob: image })
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(duplicate)
    try {
      await expect(
        createIssue({ ...request, operationId: 'c', expectedNumber: 2 }, image, image),
      ).rejects.toThrow()
    } finally {
      uuid.mockRestore()
    }
    expect((await getSessionByKey('domain', 'https://shop.example.ru'))?.nextNumber).toBe(2)
    expect(await listIssues(session?.id ?? '')).toHaveLength(1)
  })
})
