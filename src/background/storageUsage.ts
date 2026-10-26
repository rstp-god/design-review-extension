import type { StorageUsage } from '@/shared/model'
import { countSessions } from './db'

/**
 * Bytes used by the extension origin (IndexedDB with the screenshots is practically all of it)
 * and the number of sessions, for the popup footer and the settings "Data" section.
 */
export async function getStorageUsage(): Promise<StorageUsage> {
  const estimate = await globalThis.navigator?.storage?.estimate?.().catch(() => undefined)
  return { bytes: estimate?.usage ?? 0, sessions: await countSessions() }
}
