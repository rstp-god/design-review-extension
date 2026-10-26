import { type ChromeMock, installChromeMock } from '@tests/mocks/chrome'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMessageListener,
  MessageError,
  type MessageHandlers,
  sendToBackground,
  sendToTab,
} from '@/shared/messaging'

const sender = { id: 'x' } as chrome.runtime.MessageSender

function listen(handlers: MessageHandlers) {
  const listener = createMessageListener(handlers)
  chrome.runtime.onMessage.addListener(listener)
  return listener
}

async function failure(promise: Promise<unknown>): Promise<MessageError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof MessageError) return error
    throw error
  }
  throw new Error('expected the message to fail')
}

describe('messaging', () => {
  let mock: ChromeMock

  beforeEach(() => {
    mock = installChromeMock()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delivers a validated request and returns the validated response', async () => {
    const handler = vi.fn(async () => ({ bytes: 12, sessions: 2 }))
    listen({ 'storage/usage': handler })

    await expect(sendToBackground('storage/usage', {})).resolves.toEqual({ bytes: 12, sessions: 2 })
    expect(handler).toHaveBeenCalledWith({}, expect.objectContaining({ id: expect.any(String) }))
  })

  it('rejects an invalid request before it reaches the wire', async () => {
    const handler = vi.fn()
    listen({ 'session/delete': handler })

    const error = await failure(
      sendToBackground('session/delete', { id: '' } as unknown as { id: string }),
    )
    expect(error.code).toBe('invalid-request')
    expect(handler).not.toHaveBeenCalled()
  })

  it('reports a handler that throws', async () => {
    listen({
      'session/delete': async () => {
        throw new Error('not found')
      },
    })

    const error = await failure(sendToBackground('session/delete', { id: 'a' }))
    expect(error.code).toBe('handler-failed')
    expect(error.message).toContain('not found')
  })

  it('refuses a handler response that violates the contract', async () => {
    listen({
      'storage/usage': async () => ({ bytes: -1, sessions: 0 }),
    })

    const error = await failure(sendToBackground('storage/usage', {}))
    expect(error.code).toBe('handler-failed')
    expect(error.message).toContain('invalid-response')
  })

  it('answers invalid incoming payloads with an error instead of calling the handler', () => {
    const handler = vi.fn()
    const listener = createMessageListener({ 'session/delete': handler })
    const sendResponse = vi.fn()

    const handled = listener({ type: 'session/delete', payload: { id: 42 } }, sender, sendResponse)

    expect(handled).toBe(true)
    expect(handler).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'invalid-request' }),
      }),
    )
  })

  it('ignores foreign messages and types without a handler', () => {
    const listener = createMessageListener({ 'session/list': async () => [] })
    const sendResponse = vi.fn()

    expect(listener('hello', sender, sendResponse)).toBe(false)
    expect(listener({ type: 'nope', payload: {} }, sender, sendResponse)).toBe(false)
    expect(listener({ type: 'session/delete', payload: { id: 'a' } }, sender, sendResponse)).toBe(
      false,
    )
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('fails with no-receiver when nobody answers or the channel is closed', async () => {
    const noListeners = await failure(sendToBackground('session/list', {}))
    expect(noListeners.code).toBe('no-receiver')

    listen({ 'session/delete': async () => ({ ok: true }) })
    const unhandled = await failure(sendToBackground('session/list', {}))
    expect(unhandled.code).toBe('no-receiver')
  })

  it('times out when the receiver never responds', async () => {
    vi.useFakeTimers()
    chrome.runtime.onMessage.addListener(() => true)

    const pending = failure(sendToBackground('session/list', {}, { timeoutMs: 1_000 }))
    await vi.advanceTimersByTimeAsync(1_001)

    expect((await pending).code).toBe('timeout')
  })

  it('rejects a malformed reply', async () => {
    chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ weird: true })
      return true
    })

    const error = await failure(sendToBackground('session/list', {}))
    expect(error.code).toBe('invalid-response')
  })

  it('sends to a tab through tabs.sendMessage', async () => {
    mock.tabs.sendMessage.mockResolvedValue({ ok: true, data: { active: true } })

    await expect(sendToTab(7, 'review/status', {})).resolves.toEqual({ active: true })
    expect(mock.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: 'review/status',
      payload: {},
    })
  })

  it('maps a missing content script to no-receiver', async () => {
    mock.tabs.sendMessage.mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    )

    const error = await failure(sendToTab(7, 'review/status', {}))
    expect(error.code).toBe('no-receiver')
  })
})
