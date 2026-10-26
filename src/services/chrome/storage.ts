import { getChrome } from './runtime'

export type StorageArea = 'local' | 'sync'

export interface StorageChange {
  oldValue?: unknown
  newValue?: unknown
}

export type StorageChangeListener = (
  changes: Record<string, StorageChange>,
  area: StorageArea,
) => void

/**
 * Outside the extension there is no `chrome.storage`; an in-memory map keeps the stores working
 * (unit tests, dev pages). It emits no change events — nothing else could be listening.
 */
const memory: Record<StorageArea, Map<string, unknown>> = {
  local: new Map(),
  sync: new Map(),
}

function chromeArea(area: StorageArea): chrome.storage.StorageArea | null {
  return getChrome()?.storage?.[area] ?? null
}

export async function getArea<T>(area: StorageArea, key: string): Promise<T | null> {
  const store = chromeArea(area)
  if (!store) return (memory[area].get(key) as T | undefined) ?? null
  const result = await store.get(key)
  return (result[key] as T | undefined) ?? null
}

/**
 * Writes `value` under `key`. A failed `sync` write (quota, rate limit) is reported as `false`
 * instead of throwing, so the UI keeps working; `local` failures are real errors.
 */
export async function setArea(area: StorageArea, key: string, value: unknown): Promise<boolean> {
  const store = chromeArea(area)
  if (!store) {
    memory[area].set(key, structuredClone(value))
    return true
  }

  try {
    await store.set({ [key]: value })
    return true
  } catch (error) {
    if (area === 'sync') {
      console.warn('[storage] sync write failed:', error instanceof Error ? error.name : error)
      return false
    }
    throw error
  }
}

export async function removeArea(area: StorageArea, key: string): Promise<void> {
  const store = chromeArea(area)
  if (!store) {
    memory[area].delete(key)
    return
  }
  await store.remove(key)
}

/** Subscribes to changes in both areas; returns the unsubscribe function. */
export function onStorageChanged(listener: StorageChangeListener): () => void {
  const storage = getChrome()?.storage
  if (!storage?.onChanged) return () => {}

  const handler = (changes: Record<string, StorageChange>, areaName: string) => {
    if (areaName === 'local' || areaName === 'sync') listener(changes, areaName)
  }
  storage.onChanged.addListener(handler)
  return () => storage.onChanged.removeListener(handler)
}

/** Test helper: drops the in-memory fallback. */
export function clearMemoryStorage(): void {
  memory.local.clear()
  memory.sync.clear()
}
