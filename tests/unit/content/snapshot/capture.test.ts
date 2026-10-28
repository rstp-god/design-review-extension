// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAPTURING_ATTRIBUTE,
  dataUrlToBlob,
  SnapshotError,
  sampleAccuracy,
  takeSnapshot,
} from '@/content/snapshot/capture'
import { walkSnapshot } from '@/content/snapshot/walk'
import type { Rect } from '@/shared/model'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

interface Fake {
  host: HTMLElement
  button: HTMLElement
  bitmap: ImageBitmap
  frames: () => number
}

function setup(): Fake {
  document.body.innerHTML = `<main><button type="button" class="cta">Go</button></main>`
  const host = document.createElement('dr-overlay')
  document.documentElement.append(host)
  const button = document.querySelector('button') as HTMLElement
  const rects = new Map<Element, Rect>([
    [document.documentElement, { x: 0, y: 0, w: 1280, h: 720 }],
    [document.body, { x: 0, y: 0, w: 1280, h: 720 }],
    [document.querySelector('main') as Element, { x: 0, y: 0, w: 1280, h: 720 }],
    [button, { x: 100, y: 100, w: 200, h: 40 }],
  ])
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const value = rects.get(this) ?? { x: 0, y: 0, w: 0, h: 0 }
    return {
      x: value.x,
      y: value.y,
      width: value.w,
      height: value.h,
      left: value.x,
      top: value.y,
      right: value.x + value.w,
      bottom: value.y + value.h,
      toJSON: () => value,
    } as DOMRect
  })
  let frames = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames += 1
    return setTimeout(() => callback(performance.now()), 0)
  })
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
  const bitmap = { width: 2560, height: 1440, close: vi.fn() } as unknown as ImageBitmap
  return { host, button, bitmap, frames: () => frames }
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('dataUrlToBlob', () => {
  it('decodes a base64 image data URL into a typed blob', async () => {
    const blob = dataUrlToBlob(PNG)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(70)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('decodes a percent-encoded data URL and rejects anything else', () => {
    expect(dataUrlToBlob('data:text/plain,hello%20there').size).toBe(11)
    expect(() => dataUrlToBlob('https://example.com/x.png')).toThrow(SnapshotError)
    expect(() => dataUrlToBlob('nonsense')).toThrow(/decode/)
  })
})

describe('takeSnapshot', () => {
  let fake: Fake

  beforeEach(() => {
    fake = setup()
    setHidden(false)
  })

  afterEach(() => {
    fake.host.remove()
    document.body.innerHTML = ''
    setHidden(false)
  })

  it('hides our UI, asks for the capture before the walk and returns the frozen page', async () => {
    const rectSpy = Element.prototype.getBoundingClientRect as unknown as ReturnType<typeof vi.fn>
    let hiddenAtCapture = false
    let rectsReadBeforeCapture = -1
    const requestCapture = vi.fn(async () => {
      hiddenAtCapture = fake.host.hasAttribute(CAPTURING_ATTRIBUTE)
      rectsReadBeforeCapture = rectSpy.mock.calls.length
      return { dataUrl: PNG }
    })
    const decode = vi.fn(async (dataUrl: string) => {
      expect(dataUrl).toBe(PNG)
      return fake.bitmap
    })

    const snapshot = await takeSnapshot({
      host: fake.host,
      fields: ['colors'],
      requestCapture,
      decode,
    })

    expect(fake.frames()).toBeGreaterThanOrEqual(2)
    expect(hiddenAtCapture).toBe(true)
    expect(rectsReadBeforeCapture).toBe(0)
    expect(fake.host.hasAttribute(CAPTURING_ATTRIBUTE)).toBe(false)
    expect(snapshot.bitmap).toBe(fake.bitmap)
    expect(snapshot.viewport).toEqual({ w: window.innerWidth, h: window.innerHeight })
    expect(snapshot.dpr).toBe(2)
    expect(snapshot.scroll).toEqual({ x: 0, y: 0 })
    expect(snapshot.fields).toEqual(['colors'])
    expect(snapshot.nodes.map((node) => node.descriptor.tag)).toEqual([
      'html',
      'body',
      'main',
      'button',
    ])
    expect(snapshot.hittable).toHaveLength(4)
    expect(snapshot.timings.captureMs).toBeGreaterThanOrEqual(0)
    expect(snapshot.timings.decodeMs).toBeGreaterThanOrEqual(0)
    expect(snapshot.timings.totalMs).toBeGreaterThanOrEqual(snapshot.timings.walkMs)
    expect(snapshot.accuracy).toBeUndefined()
  })

  it('refuses a hidden tab before touching anything', async () => {
    setHidden(true)
    const requestCapture = vi.fn(async () => ({ dataUrl: PNG }))
    await expect(
      takeSnapshot({ host: fake.host, fields: [], requestCapture }),
    ).rejects.toMatchObject({ reason: 'hidden' })
    expect(requestCapture).not.toHaveBeenCalled()
    expect(fake.host.hasAttribute(CAPTURING_ATTRIBUTE)).toBe(false)
  })

  it('gives up when the tab goes hidden while waiting for the frames (rAF never fires)', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('requestAnimationFrame', () => 0)
      const requestCapture = vi.fn(async () => ({ dataUrl: PNG }))
      const pending = takeSnapshot({ host: fake.host, fields: [], requestCapture })
      const settled = pending.then(
        () => 'resolved',
        (error: unknown) => error,
      )
      setHidden(true)
      await vi.advanceTimersByTimeAsync(600)
      const outcome = await settled
      expect(outcome).toBeInstanceOf(SnapshotError)
      expect((outcome as SnapshotError).reason).toBe('hidden')
      expect(requestCapture).not.toHaveBeenCalled()
      expect(fake.host.hasAttribute(CAPTURING_ATTRIBUTE)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a failed capture and a failed decode, with our UI shown again', async () => {
    await expect(
      takeSnapshot({
        host: fake.host,
        fields: [],
        requestCapture: async () => {
          throw new Error('the tab is not the active tab of its window')
        },
      }),
    ).rejects.toMatchObject({ reason: 'capture' })
    expect(fake.host.hasAttribute(CAPTURING_ATTRIBUTE)).toBe(false)

    await expect(
      takeSnapshot({
        host: fake.host,
        fields: [],
        requestCapture: async () => ({ dataUrl: PNG }),
        decode: async () => {
          throw new Error('bad image')
        },
      }),
    ).rejects.toMatchObject({ reason: 'decode' })
    expect(fake.host.hasAttribute(CAPTURING_ATTRIBUTE)).toBe(false)
  })

  it('samples the accuracy against elementsFromPoint when asked (E2E build)', async () => {
    document.elementsFromPoint = vi.fn((x: number, y: number) => {
      if (x >= 100 && x < 300 && y >= 100 && y < 140) return [fake.button, document.body]
      return [document.body, document.documentElement]
    })
    const snapshot = await takeSnapshot({
      host: fake.host,
      fields: [],
      requestCapture: async () => ({ dataUrl: PNG }),
      decode: async () => fake.bitmap,
      sampleAccuracy: true,
    })
    expect(snapshot.accuracy).toMatchObject({ points: 32 * 18, unanswered: 0 })
    // `main` covers the viewport in the walk, but the fake live page says `body`: every point
    // outside the button disagrees — the sampler is honest about it.
    expect(snapshot.accuracy?.mismatches).toBeGreaterThan(0)
    expect(snapshot.accuracy?.examples[0]).toMatchObject({ live: 'body', snapshot: 'main' })
    expect(snapshot.accuracy?.examples.length).toBeLessThanOrEqual(10)
  })

  it('counts a point as a match through shadow hosts and svg roots, and skips the void', () => {
    const walk = walkSnapshot({
      root: document,
      host: fake.host,
      viewport: { w: 1280, h: 720 },
      fields: [],
    })
    document.elementsFromPoint = vi.fn((x: number, y: number) => {
      if (x < 0 || y < 0) return []
      if (x >= 100 && x < 300 && y >= 100 && y < 140) return [fake.host, fake.button]
      return [document.querySelector('main') as Element]
    })
    const sample = sampleAccuracy(document, fake.host, walk.hittable, { w: 1280, h: 720 })
    expect(sample.mismatches).toBe(0)
    expect(sample.unanswered).toBe(0)
    expect(sample.points).toBe(32 * 18)
  })
})
