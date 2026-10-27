import { requireChrome } from './runtime'

/**
 * Runs a file from the extension package in the top frame of a tab, in the isolated world. This
 * is the only way code of ours reaches a page: no `world: 'MAIN'`, no script tags.
 */
export async function executeScriptFile(tabId: number, file: string): Promise<void> {
  await requireChrome('scripting').scripting.executeScript({ target: { tabId }, files: [file] })
}
