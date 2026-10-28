import { svgRootOf } from '@/content/picker/live'
import { topNodeAt } from '@/content/picker/snapshot'
import { sendToBackground } from '@/shared/messaging'
import type { TooltipField } from '@/shared/model'
import { descriptorPart } from './descriptor'
import { type SnapshotNode, type WalkTimings, walkSnapshot } from './walk'

/** Set on our host while the screenshot is taken; overlay.css hides everything under it. */
export const CAPTURING_ATTRIBUTE = 'data-dr-capturing'

/** Frames to wait after hiding our UI so the compositor has painted the page without it. */
const FRAMES_BEFORE_CAPTURE = 2
/** `requestAnimationFrame` stops in a hidden tab: a frame that takes longer than this is checked. */
const FRAME_TIMEOUT_MS = 250
/** A visible tab that produces no frame for this long is not going to: the shutter gives up. */
const FRAME_GIVE_UP_MS = 2_000

/** One pass longer than this earns a toast: the page is unusually large. */
export const SLOW_WALK_MS = 1_000

export type SnapshotFailure = 'hidden' | 'capture' | 'decode'

export class SnapshotError extends Error {
  readonly reason: SnapshotFailure

  constructor(reason: SnapshotFailure, cause?: unknown) {
    super(`snapshot failed: ${reason}`, cause === undefined ? undefined : { cause })
    this.name = 'SnapshotError'
    this.reason = reason
  }
}

export interface SnapshotTimings extends WalkTimings {
  /** `capture/visible` round trip, from the request to the data URL. */
  captureMs: number
  /** Data URL → `ImageBitmap`. */
  decodeMs: number
  totalMs: number
}

/** E2E build only: the walk's hit test against `elementsFromPoint` on a grid at the shutter. */
export interface AccuracySample {
  points: number
  /** Points where the live and the snapshot answers are both there and differ. */
  mismatches: number
  /** Points the live page answered with nothing (outside the document). */
  unanswered: number
  examples: Array<{ x: number; y: number; live: string; snapshot: string }>
}

export interface Snapshot {
  takenAt: number
  viewport: { w: number; h: number }
  dpr: number
  scroll: { x: number; y: number }
  /** The screenshot in device px; `close()` it when the snapshot ends. */
  bitmap: ImageBitmap
  nodes: SnapshotNode[]
  hittable: SnapshotNode[]
  rootFontSize: number
  /** The fields captured; others show `—` in the tooltip until the next snapshot. */
  fields: TooltipField[]
  visited: number
  timings: SnapshotTimings
  accuracy?: AccuracySample
}

export interface TakeSnapshotOptions {
  /** Our overlay host. */
  host: HTMLElement
  fields: readonly TooltipField[]
  document?: Document
  /** The screenshot request; `capture/visible` to the background by default. */
  requestCapture?: () => Promise<{ dataUrl: string }>
  decode?: (dataUrl: string) => Promise<ImageBitmap>
  /** E2E build: sample the grid for the accuracy report. */
  sampleAccuracy?: boolean
  now?: () => number
}

type FrameOutcome = 'frame' | 'timeout'

function raceFrame(win: Window): Promise<FrameOutcome> {
  return new Promise((resolve) => {
    let done = false
    const finish = (outcome: FrameOutcome) => {
      if (done) return
      done = true
      resolve(outcome)
    }
    win.requestAnimationFrame(() => finish('frame'))
    win.setTimeout(() => finish('timeout'), FRAME_TIMEOUT_MS)
  })
}

/**
 * Waits for one painted frame. A timeout means either a hidden tab (rAF is paused there — the
 * snapshot would be of another tab) or a page too busy to paint; only a real frame guarantees
 * that our hidden UI is out of the picture, so a visible tab keeps waiting, up to a limit.
 */
async function nextFrame(win: Window, doc: Document, now: () => number): Promise<void> {
  const started = now()
  for (;;) {
    if ((await raceFrame(win)) === 'frame') return
    if (doc.hidden) throw new SnapshotError('hidden')
    if (now() - started >= FRAME_GIVE_UP_MS) throw new SnapshotError('capture', 'no frame')
  }
}

/** `data:image/png;base64,…` → `Blob`, by hand: `fetch` of a data URL is subject to the page's CSP. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, comma)
  const match = /^data:([^;,]+)(;base64)?$/.exec(header)
  if (comma === -1 || !match) throw new SnapshotError('decode', 'not a data URL')
  const type = match[1] ?? 'application/octet-stream'
  const payload = dataUrl.slice(comma + 1)
  if (!match[2]) return new Blob([decodeURIComponent(payload)], { type })
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}

async function decodeDataUrl(dataUrl: string): Promise<ImageBitmap> {
  return createImageBitmap(dataUrlToBlob(dataUrl))
}

const GRID_COLUMNS = 32
const GRID_ROWS = 18
const MAX_EXAMPLES = 10

/** The light-DOM element `elementsFromPoint` on the document would report for a node. */
function retargeted(element: Element): Element {
  let current = element
  for (;;) {
    const root = current.getRootNode()
    if (!(root instanceof ShadowRoot)) return current
    current = root.host
  }
}

function labelOf(element: Element): string {
  const classes = Array.from(element.classList)
    .slice(0, 2)
    .map((name) => `.${name}`)
    .join('')
  return `${element.localName}${element.id ? `#${element.id}` : ''}${classes}`
}

/**
 * Compares the walk's hit test with the live page on a grid while the page still looks the way
 * the walk saw it (our UI is hidden). Only in the E2E build: a few tens of milliseconds.
 */
export function sampleAccuracy(
  doc: Document,
  host: Element,
  hittable: readonly SnapshotNode[],
  viewport: { w: number; h: number },
): AccuracySample {
  const sample: AccuracySample = { points: 0, mismatches: 0, unanswered: 0, examples: [] }
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const x = Math.floor(((column + 0.5) * viewport.w) / GRID_COLUMNS)
      const y = Math.floor(((row + 0.5) * viewport.h) / GRID_ROWS)
      sample.points += 1
      const live = doc.elementsFromPoint(x, y).find((element) => element !== host)
      if (!live) {
        sample.unanswered += 1
        continue
      }
      const expected = svgRootOf(live)
      const node = topNodeAt(hittable, x, y)
      const element = node?.element.deref()
      const actual = element ? retargeted(element) : null
      if (actual === expected) continue
      sample.mismatches += 1
      if (sample.examples.length < MAX_EXAMPLES) {
        sample.examples.push({
          x,
          y,
          live: labelOf(expected),
          snapshot: node ? descriptorPart(node.descriptor) : 'null',
        })
      }
    }
  }
  return sample
}

/**
 * The shutter (spec F5.4). Hides our UI, waits two frames, then asks the background for the
 * screenshot and — without awaiting it — walks the page synchronously. The walk blocks the main
 * thread, so the page cannot produce a new frame until it is done: the screenshot the browser
 * takes meanwhile is the frame the walk measured. Capture first, walk right after; the other way
 * round would photograph the instant after the measurements.
 */
export async function takeSnapshot({
  host,
  fields,
  document: doc = document,
  requestCapture = () => sendToBackground('capture/visible', {}),
  decode = decodeDataUrl,
  sampleAccuracy: sampling = false,
  now = () => performance.now(),
}: TakeSnapshotOptions): Promise<Snapshot> {
  const win = doc.defaultView ?? window
  if (doc.hidden) throw new SnapshotError('hidden')
  const started = now()

  host.setAttribute(CAPTURING_ATTRIBUTE, '')
  try {
    for (let frame = 0; frame < FRAMES_BEFORE_CAPTURE; frame += 1) await nextFrame(win, doc, now)
    if (doc.hidden) throw new SnapshotError('hidden')

    const viewport = { w: win.innerWidth, h: win.innerHeight }
    const captureStarted = now()
    const capture = requestCapture().catch((error: unknown) => {
      throw new SnapshotError('capture', error)
    })
    // Should the walk below throw, the rejection of the capture must not go unhandled.
    capture.catch(() => {})
    // Synchronous from here until the walk returns: the page cannot change under the camera.
    const walk = walkSnapshot({ root: doc, host, viewport, fields, now })
    const accuracy = sampling ? sampleAccuracy(doc, host, walk.hittable, viewport) : undefined
    const takenAt = Date.now()
    const scroll = { x: win.scrollX, y: win.scrollY }
    const dpr = win.devicePixelRatio

    const { dataUrl } = await capture
    const captureMs = now() - captureStarted
    host.removeAttribute(CAPTURING_ATTRIBUTE)

    const decodeStarted = now()
    let bitmap: ImageBitmap
    try {
      bitmap = await decode(dataUrl)
    } catch (error) {
      throw error instanceof SnapshotError ? error : new SnapshotError('decode', error)
    }
    const decodeMs = now() - decodeStarted

    return {
      takenAt,
      viewport,
      dpr,
      scroll,
      bitmap,
      nodes: walk.nodes,
      hittable: walk.hittable,
      rootFontSize: walk.rootFontSize,
      fields: [...fields],
      visited: walk.visited,
      timings: { ...walk.timings, captureMs, decodeMs, totalMs: now() - started },
      accuracy,
    }
  } finally {
    host.removeAttribute(CAPTURING_ATTRIBUTE)
  }
}
