import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { RequestOf, ResponseOf } from '@/shared/messaging'
import type {
  Issue,
  ReviewSession,
  SessionScope,
  SessionSummary,
  SeverityCounts,
} from '@/shared/model'
import { normalizePath, sessionKey } from '@/shared/sessionKey'

/**
 * IndexedDB owned by the service worker (spec 5.4). Nothing else opens it: popup, content script
 * and report page go through messages — a contract test enforces the boundary.
 */
export const DB_NAME = 'design-review'
export const DB_VERSION = 1

export interface BlobRecord {
  id: string
  blob: Blob
}

interface DesignReviewDB extends DBSchema {
  sessions: {
    key: string
    value: ReviewSession
    indexes: { 'by-scope-key': [string, string]; 'by-origin': string; 'by-updatedAt': string }
  }
  issues: {
    key: string
    value: Issue
    indexes: {
      'by-session': string
      'by-session-number': [string, number]
      'by-session-path': [string, string]
    }
  }
  blobs: {
    key: string
    value: BlobRecord
  }
}

type Db = IDBPDatabase<DesignReviewDB>

let connection: Promise<Db> | null = null

/** Schema migrations by version. Each block upgrades from `version - 1`. */
function upgrade(db: Db, oldVersion: number): void {
  if (oldVersion < 1) {
    const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
    sessions.createIndex('by-scope-key', ['scope', 'key'], { unique: true })
    sessions.createIndex('by-origin', 'origin')
    sessions.createIndex('by-updatedAt', 'updatedAt')

    const issues = db.createObjectStore('issues', { keyPath: 'id' })
    issues.createIndex('by-session', 'sessionId')
    issues.createIndex('by-session-number', ['sessionId', 'number'], { unique: true })
    issues.createIndex('by-session-path', ['sessionId', 'pagePath'])

    db.createObjectStore('blobs', { keyPath: 'id' })
  }
}

export function getDb(): Promise<Db> {
  connection ??= openDB<DesignReviewDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      upgrade(db, oldVersion)
    },
    blocking() {
      // Another context is upgrading the schema: let it, and reopen lazily next time.
      void connection?.then((db) => db.close())
      connection = null
    },
  })
  return connection
}

/** Closes the cached connection (tests swap the IndexedDB factory between cases). */
export async function closeDb(): Promise<void> {
  const pending = connection
  connection = null
  if (pending) (await pending).close()
}

export async function getSession(id: string): Promise<ReviewSession | undefined> {
  return (await getDb()).get('sessions', id)
}

export async function getSessionByKey(
  scope: SessionScope,
  key: string,
): Promise<ReviewSession | undefined> {
  return (await getDb()).getFromIndex('sessions', 'by-scope-key', [scope, key])
}

export async function putSession(session: ReviewSession): Promise<void> {
  await (await getDb()).put('sessions', session)
}

/** All sessions, most recently updated first. */
export async function listSessions(): Promise<ReviewSession[]> {
  const sessions = await (await getDb()).getAllFromIndex('sessions', 'by-updatedAt')
  return sessions.reverse()
}

export async function countSessions(): Promise<number> {
  return (await getDb()).count('sessions')
}

export async function putIssue(issue: Issue): Promise<void> {
  await (await getDb()).put('issues', issue)
}

export async function listIssues(sessionId: string): Promise<Issue[]> {
  return (await getDb()).getAllFromIndex('issues', 'by-session', sessionId)
}

export async function putBlob(record: BlobRecord): Promise<void> {
  await (await getDb()).put('blobs', record)
}

export async function getBlob(id: string): Promise<BlobRecord | undefined> {
  return (await getDb()).get('blobs', id)
}

/** Update only the editable fields; preserve screenshot IDs and session numbering. */
export async function updateIssue(
  sessionId: string,
  issueId: string,
  text: string,
  severity: Issue['severity'],
): Promise<void> {
  const tx = (await getDb()).transaction('issues', 'readwrite')
  const issue = await tx.store.get(issueId)
  if (!issue || issue.sessionId !== sessionId) throw new Error('Issue not found')
  await tx.store.put({ ...issue, text, severity, updatedAt: new Date().toISOString() })
  await tx.done
}

/** Delete the issue and both images atomically, leaving nextNumber untouched. */
export async function deleteIssue(sessionId: string, issueId: string): Promise<void> {
  const tx = (await getDb()).transaction(['issues', 'blobs'], 'readwrite')
  const issue = await tx.objectStore('issues').get(issueId)
  if (!issue || issue.sessionId !== sessionId) throw new Error('Issue not found')
  await Promise.all([
    tx.objectStore('issues').delete(issueId),
    tx.objectStore('blobs').delete(issue.shots.cropId),
    tx.objectStore('blobs').delete(issue.shots.viewportId),
    tx.done,
  ])
}

/** Deletes a session with its issues and their screenshots in one transaction. */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['sessions', 'issues', 'blobs'], 'readwrite')
  const issues = await tx.objectStore('issues').index('by-session').getAll(id)

  const operations: Promise<unknown>[] = []
  for (const issue of issues) {
    operations.push(tx.objectStore('issues').delete(issue.id))
    operations.push(tx.objectStore('blobs').delete(issue.shots.cropId))
    operations.push(tx.objectStore('blobs').delete(issue.shots.viewportId))
  }
  operations.push(tx.objectStore('sessions').delete(id))

  await Promise.all([...operations, tx.done])
}

export async function deleteAllSessions(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['sessions', 'issues', 'blobs'], 'readwrite')
  await Promise.all([
    tx.objectStore('sessions').clear(),
    tx.objectStore('issues').clear(),
    tx.objectStore('blobs').clear(),
    tx.done,
  ])
}

export function summarize(session: ReviewSession, issues: Issue[]): SessionSummary {
  const bySeverity: SeverityCounts = { blocker: 0, major: 0, minor: 0 }
  const pages = new Set<string>()
  for (const issue of issues) {
    bySeverity[issue.severity] += 1
    pages.add(issue.pagePath)
  }
  return { session, issueCount: issues.length, pageCount: pages.size, bySeverity }
}

export async function getSessionSummary(session: ReviewSession): Promise<SessionSummary> {
  return summarize(session, await listIssues(session.id))
}

export async function getSessionSummaryByKey(
  scope: SessionScope,
  key: string,
): Promise<SessionSummary | null> {
  const session = await getSessionByKey(scope, key)
  return session ? getSessionSummary(session) : null
}

/** Allocate a number and persist the whole issue together, or write nothing. */
export async function createIssue(
  request: RequestOf<'issue/create'>,
  crop: Blob,
  viewport: Blob,
): Promise<ResponseOf<'issue/create'>> {
  const db = await getDb()
  const tx = db.transaction(['sessions', 'issues', 'blobs'], 'readwrite')
  const sessions = tx.objectStore('sessions')
  const issues = tx.objectStore('issues')
  const blobs = tx.objectStore('blobs')
  const url = new URL(request.draft.pageUrl)
  const key = sessionKey(url, request.scope)
  const existing = await issues.get(request.operationId)
  if (existing) {
    const session = await sessions.get(existing.sessionId)
    if (!session || session.scope !== request.scope || session.key !== key) {
      tx.abort()
      await tx.done.catch(() => {})
      throw new Error('Operation ID belongs to another session')
    }
    const savedIssues = await issues.index('by-session').getAll(session.id)
    await tx.done
    return { status: 'created', issue: existing, summary: summarize(session, savedIssues) }
  }
  let session = await sessions.index('by-scope-key').get([request.scope, key])
  const nextNumber = session?.nextNumber ?? 1
  if (nextNumber !== request.expectedNumber) {
    await tx.done
    return { status: 'conflict', nextNumber }
  }
  const now = new Date().toISOString()
  session ??= {
    id: crypto.randomUUID(),
    scope: request.scope,
    key,
    origin: url.origin,
    ...(request.scope === 'page' ? { path: normalizePath(url.pathname) } : {}),
    title: request.scope === 'domain' ? url.host : request.draft.pageTitle,
    createdAt: now,
    updatedAt: now,
    nextNumber: 1,
  }
  const issue: Issue = {
    ...request.draft,
    id: request.operationId,
    sessionId: session.id,
    number: nextNumber,
    shots: { cropId: crypto.randomUUID(), viewportId: crypto.randomUUID() },
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }
  session = { ...session, nextNumber: nextNumber + 1, updatedAt: now }
  try {
    await Promise.all([
      sessions.put(session),
      issues.add(issue),
      blobs.add({ id: issue.shots.cropId, blob: crop }),
      blobs.add({ id: issue.shots.viewportId, blob: viewport }),
    ])
    const savedIssues = await issues.index('by-session').getAll(session.id)
    await tx.done
    return { status: 'created', issue, summary: summarize(session, savedIssues) }
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* A failed request may already have aborted it. */
    }
    await tx.done.catch(() => {})
    throw error
  }
}

export async function listSessionSummaries(): Promise<SessionSummary[]> {
  const sessions = await listSessions()
  return Promise.all(sessions.map((session) => getSessionSummary(session)))
}
