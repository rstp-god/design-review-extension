import { installChromeMock, mockTab } from '@tests/mocks/chrome'
import { expect, it, vi } from 'vitest'
import { onIssueFormConnect } from '@/background/issueFormChannel'
import { ISSUE_FORM_PORT } from '@/shared/messaging'

function makePort(sender: Partial<chrome.runtime.MessageSender>) {
  let onMessage: ((value: unknown) => void) | undefined
  let onDisconnect: (() => void) | undefined
  const port = {
    name: ISSUE_FORM_PORT,
    sender,
    onMessage: {
      addListener: (listener: (value: unknown) => void) => {
        onMessage = listener
      },
    },
    onDisconnect: {
      addListener: (listener: () => void) => {
        onDisconnect = listener
      },
    },
    postMessage: vi.fn(),
    disconnect: vi.fn(() => onDisconnect?.()),
  }
  onIssueFormConnect(port as unknown as chrome.runtime.Port)
  return { port, send: (value: unknown) => onMessage?.(value) }
}

it('only pairs the registered tab and extension frame with the one-time capability', () => {
  const chrome = installChromeMock()
  const tab = mockTab({ id: 7 })
  const owner = makePort({ tab, frameId: 0, url: 'https://example.com/' })
  owner.send({ type: 'register', token: 'test-capability', severity: 'major', theme: 'dark' })
  expect(owner.port.postMessage).toHaveBeenCalledWith({ type: 'registered' })
  const url = `chrome-extension://${chrome.runtime.id}/src/issue/index.html`
  const wrongTab = makePort({ tab: mockTab({ id: 8 }), frameId: 2, url })
  wrongTab.send({ type: 'claim', token: 'test-capability' })
  const wrongUrl = makePort({ tab, frameId: 2, url: 'https://example.com/' })
  wrongUrl.send({ type: 'claim', token: 'test-capability' })
  const wrongToken = makePort({ tab, frameId: 2, url })
  wrongToken.send({ type: 'claim', token: 'wrong' })
  for (const candidate of [wrongTab, wrongUrl, wrongToken]) {
    candidate.send({ type: 'submit', text: 'forged', severity: 'major' })
    expect(candidate.port.postMessage).not.toHaveBeenCalled()
  }
  expect(owner.port.postMessage).toHaveBeenCalledTimes(1)
  const frame = makePort({ tab, frameId: 2, url })
  frame.send({ type: 'claim', token: 'test-capability' })
  expect(frame.port.postMessage).toHaveBeenCalledWith({
    type: 'config',
    severity: 'major',
    theme: 'dark',
    styles: undefined,
  })
  frame.send({ type: 'submit', text: '   ', severity: 'major' })
  expect(owner.port.postMessage).toHaveBeenCalledTimes(1)
  frame.send({ type: 'submit', text: 'real issue', severity: 'major' })
  expect(owner.port.postMessage).toHaveBeenLastCalledWith({
    type: 'submit',
    text: 'real issue',
    severity: 'major',
  })
  owner.port.disconnect()
  expect(frame.port.disconnect).toHaveBeenCalled()
})
