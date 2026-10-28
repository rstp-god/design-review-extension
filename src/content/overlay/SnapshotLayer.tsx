import { TestId } from '@tests/constants/testIds'
import { useLayoutEffect, useRef } from 'react'
import type { Snapshot } from '@/content/snapshot/capture'

/**
 * The frozen page (spec F5.5): the screenshot over the whole viewport, inside our shadow root.
 * The canvas is sized in device px and displayed in CSS px, so any pixel ratio or zoom maps 1:1.
 * It takes every pointer event itself — nothing reaches the page under it — and the tools draw
 * on top of it; a canvas is not subject to the page's `img-src` policy the way an `<img>` is.
 */
export function SnapshotLayer({ snapshot }: { snapshot: Snapshot }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return
    element.width = snapshot.bitmap.width
    element.height = snapshot.bitmap.height
    const context = element.getContext('2d')
    context?.drawImage(snapshot.bitmap, 0, 0)
  }, [snapshot])

  return (
    <div
      aria-hidden="true"
      data-testid={TestId.SnapshotLayer}
      className="pointer-events-auto fixed inset-0 z-0 cursor-default select-none overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
    >
      <canvas
        ref={canvas}
        className="block"
        style={{ width: snapshot.viewport.w, height: snapshot.viewport.h }}
      />
    </div>
  )
}
