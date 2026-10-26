import { requireChrome } from './runtime'

/** Runs a file from the extension package in the top frame of a tab (isolated world). */
export async function executeScriptFile(tabId: number, file: string): Promise<void> {
  await requireChrome('scripting').scripting.executeScript({ target: { tabId }, files: [file] })
}

/**
 * Runs a self-contained function in a tab. `world: 'MAIN'` reaches the page's own JS realm
 * without a `<script>` tag, so the page's CSP does not apply and nothing is exposed as a
 * web-accessible resource. The function must not close over anything: it is serialized.
 */
export async function executeScriptFunction(
  tabId: number,
  func: () => void,
  world: 'MAIN' | 'ISOLATED' = 'ISOLATED',
): Promise<void> {
  await requireChrome('scripting').scripting.executeScript({ target: { tabId }, func, world })
}
