/**
 * Guarded access to `chrome.*`. Outside the extension (Vitest, a plain browser tab in dev) the
 * global may be missing; every other wrapper in this folder goes through `getChrome` /
 * `requireChrome` so the failure is a clear error instead of a `ReferenceError`.
 */
export type ChromeApi = typeof chrome

export function getChrome(): ChromeApi | null {
  return typeof chrome === 'undefined' ? null : chrome
}

export function requireChrome(api: string): ChromeApi {
  const api_ = getChrome()
  if (!api_) throw new Error(`chrome.${api} is unavailable outside the extension`)
  return api_
}

export function hasRuntime(): boolean {
  return Boolean(getChrome()?.runtime?.id)
}

export async function sendRuntimeMessage(message: unknown): Promise<unknown> {
  return requireChrome('runtime').runtime.sendMessage(message)
}

export type RuntimeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined

/** Registers a `runtime.onMessage` listener; returns the unsubscribe function. */
export function onRuntimeMessage(listener: RuntimeMessageListener): () => void {
  const { runtime } = requireChrome('runtime')
  runtime.onMessage.addListener(listener)
  return () => runtime.onMessage.removeListener(listener)
}

export function getExtensionVersion(): string {
  return getChrome()?.runtime?.getManifest?.().version ?? ''
}

export function connectRuntime(name: string): chrome.runtime.Port {
  return requireChrome('runtime').runtime.connect({ name })
}

export function onRuntimeConnect(listener: (port: chrome.runtime.Port) => void): () => void {
  const { runtime } = requireChrome('runtime')
  runtime.onConnect.addListener(listener)
  return () => runtime.onConnect.removeListener(listener)
}

export function extensionUrl(path: string): string {
  return requireChrome('runtime').runtime.getURL(path)
}
