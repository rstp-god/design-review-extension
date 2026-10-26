import type { z } from 'zod'
import type { StateCreator, StoreApi } from 'zustand'
import { getArea, onStorageChanged, type StorageArea, setArea } from '@/services/chrome/storage'

/**
 * Zustand middleware that mirrors a slice of the store into `chrome.storage` (ported from
 * LocalDeck, trimmed to a fixed area and a single envelope shape):
 *
 * - On creation it loads the envelope, applies it through `merge` and sets `hydrated`.
 * - Every state change schedules a debounced write of `partialize(state)` wrapped in
 *   `{ meta: { originId, rev, ts }, state }`.
 * - `storage.onChanged` events from OTHER contexts (popup vs. content script vs. another device)
 *   are applied when their `rev` is not older than ours; our own echo is ignored by `originId`.
 * - A rejected `sync` write (quota) is retried on the next change instead of breaking the UI.
 */
export interface EnvelopeMeta {
  originId: string
  rev: number
  ts: number
}

export interface Envelope<Persisted> {
  meta: EnvelopeMeta
  state: Persisted
}

export interface ChromeSyncActions {
  /** `true` once the initial read finished, whether or not anything was stored. */
  hydrated: boolean
  /** Flushes pending changes immediately. */
  commit: () => Promise<void>
}

export type Synced<State> = State & ChromeSyncActions

export interface WithChromeSyncOptions<State extends object, Persisted> {
  key: string
  area: StorageArea
  schema: z.ZodType<Envelope<Persisted>>
  partialize: (state: State) => Persisted
  merge?: (current: State, persisted: Persisted) => Partial<State>
  debounceMs?: number
}

const ORIGIN_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `origin-${Math.random().toString(36).slice(2)}`

export function withChromeSync<State extends object, Persisted>({
  key,
  area,
  schema,
  partialize,
  merge = (_current, persisted) => persisted as unknown as Partial<State>,
  debounceMs = 150,
}: WithChromeSyncOptions<State, Persisted>) {
  return (config: StateCreator<State>): StateCreator<Synced<State>> =>
    (set, get, api) => {
      let rev = 0
      let lastWrittenJson: string | null = null
      let applyingRemote = false
      let hydrated = false
      let changedBeforeHydration = false
      let timer: ReturnType<typeof setTimeout> | null = null

      const typedSet = set as unknown as (partial: Partial<Synced<State>>) => void
      const typedGet = get as unknown as () => Synced<State>

      const writeNow = async () => {
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
        const state = partialize(typedGet())
        const json = JSON.stringify(state)
        if (json === lastWrittenJson) return

        rev += 1
        lastWrittenJson = json
        const written = await setArea(area, key, {
          meta: { originId: ORIGIN_ID, rev, ts: Date.now() },
          state,
        } satisfies Envelope<Persisted>)
        if (!written) lastWrittenJson = null
      }

      const scheduleWrite = () => {
        if (applyingRemote) return
        // Writing before the initial read would overwrite the stored envelope with defaults.
        if (!hydrated) {
          changedBeforeHydration = true
          return
        }
        if (debounceMs <= 0) {
          void writeNow()
          return
        }
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void writeNow()
        }, debounceMs)
      }

      const applyEnvelope = (envelope: Envelope<Persisted>) => {
        rev = Math.max(rev, envelope.meta.rev)
        lastWrittenJson = JSON.stringify(envelope.state)
        applyingRemote = true
        try {
          typedSet(merge(typedGet(), envelope.state) as Partial<Synced<State>>)
        } finally {
          applyingRemote = false
        }
      }

      void (async () => {
        const parsed = schema.safeParse(await getArea<unknown>(area, key))
        if (parsed.success) applyEnvelope(parsed.data)
        hydrated = true
        applyingRemote = true
        try {
          typedSet({ hydrated: true } as Partial<Synced<State>>)
        } finally {
          applyingRemote = false
        }
        // A change made while loading survives only when nothing was stored (`merge` replaced
        // the state otherwise); persist it now instead of waiting for the next change.
        if (changedBeforeHydration && !parsed.success) scheduleWrite()
      })()

      onStorageChanged((changes, changedArea) => {
        if (changedArea !== area) return
        const change = changes[key]
        if (!change?.newValue) return
        const parsed = schema.safeParse(change.newValue)
        if (!parsed.success) return
        if (parsed.data.meta.originId === ORIGIN_ID) return
        if (parsed.data.meta.rev < rev) return
        applyEnvelope(parsed.data)
      })
      ;(api as unknown as StoreApi<State>).subscribe(() => scheduleWrite())

      const base = config(
        set as unknown as Parameters<StateCreator<State>>[0],
        get as unknown as Parameters<StateCreator<State>>[1],
        api as unknown as Parameters<StateCreator<State>>[2],
      )
      return { ...base, hydrated: false, commit: writeNow }
    }
}
