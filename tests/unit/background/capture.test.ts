import { type ChromeMock, installChromeMock, mockTab } from '@tests/mocks/chrome'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAPTURE_MIN_INTERVAL_MS,
  CAPTURE_RETRY_DELAY_MS,
  CaptureRefusedError,
  captureSenderTab,
  createCaptureQueue,
  isCaptureQuotaError,
} from '@/background/capture'
import { messageListener } from '@/background/messageHandler'

const QUOTA_MESSAGE = 'This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.'
const PNG = 'data:image/png;base64,iVBORw0KGgo='

/** A queue driven by a virtual clock: `sleep` advances it, nothing waits for real. */
function virtualQueue(capture: (windowId: number) => Promise<string>) {
  let clock = 0
  const sleeps: number[] = []
  const queue = createCaptureQueue({
    capture,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
  })
  return { queue, sleeps, tick: (ms: number) => (clock += ms) }
}

describe('capture queue', () => {
  it('recognizes the quota error by its message', () => {
    expect(isCaptureQuotaError(new Error(QUOTA_MESSAGE))).toBe(true)
    expect(isCaptureQuotaError('quota exceeded')).toBe(true)
    expect(isCaptureQuotaError(new Error('The tab is not visible'))).toBe(false)
  })

  it('keeps at least the minimum interval between two captures', async () => {
    const capture = vi.fn(async () => PNG)
    const { queue, sleeps } = virtualQueue(capture)

    await expect(queue.capture(1)).resolves.toBe(PNG)
    expect(sleeps).toEqual([])
    await expect(queue.capture(1)).resolves.toBe(PNG)
    expect(sleeps).toEqual([CAPTURE_MIN_INTERVAL_MS])
    expect(capture).toHaveBeenCalledTimes(2)
  })

  it('does not wait when enough time has passed since the last attempt', async () => {
    const capture = vi.fn(async () => PNG)
    const { queue, sleeps, tick } = virtualQueue(capture)
    await queue.capture(1)
    tick(CAPTURE_MIN_INTERVAL_MS + 1)
    await queue.capture(1)
    expect(sleeps).toEqual([])
  })

  it('serializes concurrent requests in order', async () => {
    const order: number[] = []
    const capture = vi.fn(async (windowId: number) => {
      order.push(windowId)
      return PNG
    })
    const { queue, sleeps } = virtualQueue(capture)
    await Promise.all([queue.capture(1), queue.capture(2), queue.capture(3)])
    expect(order).toEqual([1, 2, 3])
    expect(sleeps).toEqual([CAPTURE_MIN_INTERVAL_MS, CAPTURE_MIN_INTERVAL_MS])
  })

  it('retries a quota failure after a pause and resolves', async () => {
    const capture = vi
      .fn<(windowId: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error(QUOTA_MESSAGE))
      .mockResolvedValueOnce(PNG)
    const { queue, sleeps } = virtualQueue(capture)

    await expect(queue.capture(1)).resolves.toBe(PNG)
    expect(capture).toHaveBeenCalledTimes(2)
    expect(sleeps).toEqual([CAPTURE_RETRY_DELAY_MS])
  })

  it('gives up after the maximum number of quota failures', async () => {
    const capture = vi.fn(async () => {
      throw new Error(QUOTA_MESSAGE)
    })
    const { queue } = virtualQueue(capture)
    await expect(queue.capture(1)).rejects.toThrow(/quota/)
    expect(capture).toHaveBeenCalledTimes(3)
  })

  it('surfaces any other error at once, without a retry', async () => {
    const capture = vi.fn(async () => {
      throw new Error('The tab is not visible')
    })
    const { queue, sleeps } = virtualQueue(capture)
    await expect(queue.capture(1)).rejects.toThrow('not visible')
    expect(capture).toHaveBeenCalledTimes(1)
    expect(sleeps).toEqual([])
  })

  it('keeps serving after a failed request', async () => {
    const capture = vi
      .fn<(windowId: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(PNG)
    const { queue } = virtualQueue(capture)
    await expect(queue.capture(1)).rejects.toThrow('boom')
    await expect(queue.capture(1)).resolves.toBe(PNG)
  })
})

describe('captureSenderTab', () => {
  let mock: ChromeMock

  beforeEach(() => {
    mock = installChromeMock()
  })

  const sender = (tab?: Partial<chrome.tabs.Tab>) => ({
    tab: tab ? mockTab({ id: 7, windowId: 3, ...tab }) : undefined,
  })

  it('captures the window of an active sender tab', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: 7, windowId: 3, active: true }))
    const queue = { capture: vi.fn(async () => PNG) }

    await expect(captureSenderTab(sender({}), queue)).resolves.toBe(PNG)
    expect(mock.tabs.get).toHaveBeenCalledWith(7)
    expect(queue.capture).toHaveBeenCalledWith(3)
  })

  it('refuses a message that did not come from a tab', async () => {
    const queue = { capture: vi.fn(async () => PNG) }
    await expect(captureSenderTab(sender(), queue)).rejects.toBeInstanceOf(CaptureRefusedError)
    expect(queue.capture).not.toHaveBeenCalled()
  })

  it('refuses when the sender is no longer the active tab of its window', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: 7, windowId: 3, active: false }))
    const queue = { capture: vi.fn(async () => PNG) }
    await expect(captureSenderTab(sender({}), queue)).rejects.toThrow(/active tab/)
    expect(queue.capture).not.toHaveBeenCalled()
  })

  it('refuses when the tab moved to another window or is gone', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: 7, windowId: 9, active: true }))
    const queue = { capture: vi.fn(async () => PNG) }
    await expect(captureSenderTab(sender({}), queue)).rejects.toThrow(/active tab/)

    mock.tabs.get.mockRejectedValue(new Error('No tab with id: 7.'))
    await expect(captureSenderTab(sender({}), queue)).rejects.toThrow(/active tab/)
    expect(queue.capture).not.toHaveBeenCalled()
  })

  it('answers capture/visible through the message listener with the real wrapper', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: 7, windowId: 3, active: true }))
    const sendResponse = vi.fn()
    const handled = messageListener(
      { type: 'capture/visible', payload: {} },
      { id: 'ext', tab: mockTab({ id: 7, windowId: 3 }) },
      sendResponse,
    )
    expect(handled).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: { dataUrl: PNG } })
    expect(mock.tabs.captureVisibleTab).toHaveBeenCalledWith(3, { format: 'png' })
  })

  it('reports a refusal as a handler failure', async () => {
    mock.tabs.get.mockResolvedValue(mockTab({ id: 7, windowId: 3, active: false }))
    const sendResponse = vi.fn()
    messageListener(
      { type: 'capture/visible', payload: {} },
      { id: 'ext', tab: mockTab({ id: 7, windowId: 3 }) },
      sendResponse,
    )
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'handler-failed', message: expect.stringMatching(/active tab/) },
    })
    expect(mock.tabs.captureVisibleTab).not.toHaveBeenCalled()
  })
})
