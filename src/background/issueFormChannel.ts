import { getChrome } from '@/services/chrome/runtime'
import { ISSUE_FORM_PORT, type IssueFormPortMessage, issueFormPortSchema } from '@/shared/messaging'

type Registration = {
  owner: chrome.runtime.Port
  tabId: number
  config: Extract<IssueFormPortMessage, { type: 'register' }>
  frame?: chrome.runtime.Port
}

/** Capabilities exist only while both runtime ports are alive; they never cross the page DOM. */
const registrations = new Map<string, Registration>()

export function onIssueFormConnect(port: chrome.runtime.Port): void {
  if (port.name !== ISSUE_FORM_PORT) return
  const sender = port.sender
  let token: string | undefined
  let role: 'owner' | 'frame' | undefined
  port.onMessage.addListener((raw: unknown) => {
    const parsed = issueFormPortSchema.safeParse(raw)
    if (!parsed.success) return
    const message = parsed.data
    const tabId = sender?.tab?.id
    if (!role && message.type === 'register') {
      if (tabId === undefined || sender?.frameId !== 0 || registrations.has(message.token)) {
        port.disconnect()
        return
      }
      token = message.token
      role = 'owner'
      registrations.set(token, { owner: port, tabId, config: message })
      port.postMessage({ type: 'registered' })
      return
    }
    if (!role && message.type === 'claim') {
      const entry = registrations.get(message.token)
      const extensionId = getChrome()?.runtime.id
      const expectedUrl = `chrome-extension://${extensionId}/src/issue/index.html`
      if (
        !entry ||
        entry.frame ||
        tabId !== entry.tabId ||
        sender?.frameId === undefined ||
        sender.frameId === 0 ||
        sender?.url?.split('#')[0] !== expectedUrl
      ) {
        port.disconnect()
        return
      }
      token = message.token
      role = 'frame'
      entry.frame = port
      const { severity, styles, theme } = entry.config
      port.postMessage({ type: 'config', severity, styles, theme })
      return
    }
    const entry = token ? registrations.get(token) : undefined
    if (!entry) return
    if (role === 'frame' && (message.type === 'submit' || message.type === 'cancel'))
      entry.owner.postMessage(message)
    if (role === 'owner' && (message.type === 'result' || message.type === 'missing'))
      entry.frame?.postMessage(message)
  })
  port.onDisconnect.addListener(() => {
    if (!token) return
    const entry = registrations.get(token)
    if (!entry) return
    registrations.delete(token)
    if (role === 'owner') entry.frame?.disconnect()
    else entry.owner.disconnect()
  })
}
