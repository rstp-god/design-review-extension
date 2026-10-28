import { vi } from 'vitest'

/**
 * Minimal in-memory `chrome.*` for unit tests. Storage areas emit `onChanged`, runtime messages
 * are delivered to `runtime.onMessage` listeners with Chrome's `return true` + `sendResponse`
 * semantics, everything else is a `vi.fn` the test configures.
 */

type Listener = (...args: never[]) => unknown

export interface MockEvent<L extends Listener> {
  addListener: (listener: L) => void
  removeListener: (listener: L) => void
  hasListener: (listener: L) => boolean
  hasListeners: () => boolean
  dispatch: (...args: Parameters<L>) => ReturnType<L>[]
  listeners: Set<L>
}

export function createEvent<L extends Listener>(): MockEvent<L> {
  const listeners = new Set<L>()
  return {
    listeners,
    addListener: (listener) => {
      listeners.add(listener)
    },
    removeListener: (listener) => {
      listeners.delete(listener)
    },
    hasListener: (listener) => listeners.has(listener),
    hasListeners: () => listeners.size > 0,
    dispatch: (...args) => [...listeners].map((listener) => listener(...args) as ReturnType<L>),
  }
}

type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>
type StorageChangedListener = (changes: StorageChanges, areaName: string) => void

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value)
}

function createStorageArea(areaName: string, onChanged: MockEvent<StorageChangedListener>) {
  const data = new Map<string, unknown>()

  const emit = (changes: StorageChanges) => {
    if (Object.keys(changes).length > 0) onChanged.dispatch(changes, areaName)
  }

  return {
    data,
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys === undefined || keys === null) {
        return Object.fromEntries([...data].map(([key, value]) => [key, clone(value)]))
      }
      const defaults = typeof keys === 'object' && !Array.isArray(keys) ? keys : {}
      const list =
        typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)
      const result: Record<string, unknown> = {}
      for (const key of list) {
        if (data.has(key)) result[key] = clone(data.get(key))
        else if (key in defaults) result[key] = defaults[key]
      }
      return result
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes: StorageChanges = {}
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: clone(data.get(key)), newValue: clone(value) }
        data.set(key, clone(value))
      }
      emit(changes)
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const changes: StorageChanges = {}
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!data.has(key)) continue
        changes[key] = { oldValue: clone(data.get(key)) }
        data.delete(key)
      }
      emit(changes)
    }),
    clear: vi.fn(async () => {
      const changes: StorageChanges = {}
      for (const [key, value] of data) changes[key] = { oldValue: clone(value) }
      data.clear()
      emit(changes)
    }),
  }
}

export type RuntimeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined

export const MOCK_EXTENSION_ID = 'mockextensionidmockextensionidab'

export function createChromeMock() {
  const storageChanged = createEvent<StorageChangedListener>()
  const onMessage = createEvent<RuntimeMessageListener>()
  const onCommand = createEvent<(command: string, tab?: chrome.tabs.Tab) => void>()

  const runtime = {
    id: MOCK_EXTENSION_ID,
    lastError: undefined as chrome.runtime.LastError | undefined,
    getManifest: vi.fn(() => ({ manifest_version: 3, name: 'Design Review', version: '0.1.0' })),
    onMessage,
    /**
     * Delivers to `onMessage` listeners like Chrome: the first listener that calls `sendResponse`
     * wins; a listener returning `true` may answer later; no listeners → rejection.
     */
    sendMessage: vi.fn(
      (message: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          if (!onMessage.hasListeners()) {
            reject(new Error('Could not establish connection. Receiving end does not exist.'))
            return
          }
          let answered = false
          const sendResponse = (response?: unknown) => {
            if (answered) return
            answered = true
            resolve(response)
          }
          const results = onMessage.dispatch(message, { id: MOCK_EXTENSION_ID }, sendResponse)
          if (!answered && !results.includes(true)) resolve(undefined)
        }),
    ),
  }

  const mock = {
    runtime,
    storage: {
      local: createStorageArea('local', storageChanged),
      sync: createStorageArea('sync', storageChanged),
      session: createStorageArea('session', storageChanged),
      onChanged: storageChanged,
    },
    tabs: {
      query: vi.fn(async (_query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> => []),
      get: vi.fn(async (tabId: number): Promise<chrome.tabs.Tab> => {
        throw new Error(`No tab with id: ${tabId}.`)
      }),
      sendMessage: vi.fn(async (_tabId: number, _message: unknown): Promise<unknown> => undefined),
      create: vi.fn(async (props: chrome.tabs.CreateProperties) => ({ id: 1, ...props })),
      captureVisibleTab: vi.fn(
        async (_windowId: number, _options: chrome.extensionTypes.ImageDetails) =>
          'data:image/png;base64,iVBORw0KGgo=',
      ),
    },
    scripting: {
      executeScript: vi.fn(
        async (_injection: Parameters<typeof chrome.scripting.executeScript>[0]) => [],
      ),
    },
    commands: {
      getAll: vi.fn(
        async (): Promise<chrome.commands.Command[]> => [
          { name: 'toggle-review', shortcut: 'Alt+Shift+R', description: 'Toggle' },
        ],
      ),
      onCommand,
    },
    i18n: {
      getUILanguage: vi.fn(() => 'en-US'),
    },
  }

  return mock
}

export type ChromeMock = ReturnType<typeof createChromeMock>

/** Installs the mock as the global `chrome` for the current test; `tests/setup.ts` removes it. */
export function installChromeMock(): ChromeMock {
  const mock = createChromeMock()
  vi.stubGlobal('chrome', mock)
  return mock
}

/** A tab object with sensible defaults for `tabs.query` / `tabs.get` answers. */
export function mockTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 1,
    index: 0,
    windowId: 1,
    active: true,
    highlighted: true,
    pinned: false,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    frozen: false,
    url: 'https://shop.example.ru/catalog',
    title: 'Catalog',
    ...overrides,
  } as chrome.tabs.Tab
}
