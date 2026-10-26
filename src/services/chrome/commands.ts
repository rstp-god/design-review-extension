import { getChrome, requireChrome } from './runtime'

export interface Command {
  name: string
  /** Empty when the user removed the binding or it conflicts with another extension. */
  shortcut: string
  description: string
}

/** Current bindings as Chrome reports them — never hardcode the shortcut in the UI. */
export async function getCommands(): Promise<Command[]> {
  const commands = getChrome()?.commands
  if (!commands) return []
  const list = await commands.getAll()
  return list.map((command) => ({
    name: command.name ?? '',
    shortcut: command.shortcut ?? '',
    description: command.description ?? '',
  }))
}

export function onCommand(listener: (command: string, tab?: chrome.tabs.Tab) => void): () => void {
  const { commands } = requireChrome('commands')
  commands.onCommand.addListener(listener)
  return () => commands.onCommand.removeListener(listener)
}
