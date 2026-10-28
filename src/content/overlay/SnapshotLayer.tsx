import { TestId } from '@tests/constants/testIds'
import { useLayoutEffect, useRef } from 'react'
import type { Snapshot } from '@/content/snapshot/capture'

/**
 * The frozen page (spec F5.5): the screenshot over the whole viewport, inside our shadow root.
 * The canvas is sized in device px and displayed in CSS px, so any pixel ratio or zoom maps 1:1.
 * The layer takes every pointer event itself — nothing reaches the page under it — and the tools
 * draw on top of it; a canvas is not subject to the page's `img-src` policy the way an `<img>` is.
 *
 * The canvas lives in a **closed** shadow root of its own. The picture is a compositor capture of
 * the tab: it holds pixels the page is not allowed to read (cross-origin frames and images,
 * `:visited` colours). Our main root is open for Playwright, and the page shares our DOM nodes,
 * so a canvas there could be read with `getImageData` from the page's world; a closed root hands
 * out no reference, and the page cannot patch the isolated world's `attachShadow`.
 */
export function SnapshotLayer({ snapshot }: { snapshot: Snapshot }) {
  const layer = useRef<HTMLDivElement>(null)
  const root = useRef<ShadowRoot | null>(null)

  useLayoutEffect(() => {
    const element = layer.current
    if (!element) return
    if (root.current?.host !== element) root.current = element.attachShadow({ mode: 'closed' })
    const shadow = root.current

    const canvas = element.ownerDocument.createElement('canvas')
    canvas.width = snapshot.bitmap.width
    canvas.height = snapshot.bitmap.height
    canvas.style.cssText = `display:block;width:${snapshot.viewport.w}px;height:${snapshot.viewport.h}px`
    canvas.getContext('2d')?.drawImage(snapshot.bitmap, 0, 0)
    shadow.replaceChildren(canvas)
    return () => {
      shadow.replaceChildren()
    }
  }, [snapshot])

  return (
    <div
      ref={layer}
      aria-hidden="true"
      data-testid={TestId.SnapshotLayer}
      className="pointer-events-auto fixed inset-0 z-0 cursor-default select-none overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
    />
  )
}
