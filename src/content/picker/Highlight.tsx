import { TestId } from '@tests/constants/testIds'
import type { CSSProperties } from 'react'
import type { Rect } from '@/shared/model'
import { cn } from '@/ui'
import { boxLayers } from './boxModel'
import type { BoxModel, Edges } from './source'

function rectStyle(rect: Rect): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.w, height: rect.h }
}

/**
 * A ring: a box the size of the layer whose borders are as thick as the edges, with no fill. The
 * browser draws exactly the DevTools layer without four separate strips.
 */
function Ring({
  rect,
  edges,
  className,
  testId,
}: {
  rect: Rect
  edges: Edges
  className: string
  testId: string
}) {
  return (
    <div
      data-testid={testId}
      className={cn('absolute box-border border-solid', className)}
      style={{
        ...rectStyle(rect),
        borderTopWidth: Math.max(0, edges.top),
        borderRightWidth: Math.max(0, edges.right),
        borderBottomWidth: Math.max(0, edges.bottom),
        borderLeftWidth: Math.max(0, edges.left),
      }}
    />
  )
}

/** Box-model highlight of the hovered node (spec F3.1): margin, border, padding, content. */
export function Highlight({ box }: { box: BoxModel }) {
  const layers = boxLayers(box)
  return (
    <div
      aria-hidden="true"
      data-testid={TestId.PickerHighlight}
      className="pointer-events-none fixed inset-0 z-0"
    >
      <Ring
        rect={layers.margin}
        edges={box.margin}
        className="border-box-margin"
        testId={TestId.PickerHighlightMargin}
      />
      <Ring
        rect={layers.border}
        edges={box.borderWidth}
        className="border-box-border"
        testId={TestId.PickerHighlightBorder}
      />
      <Ring
        rect={layers.padding}
        edges={box.padding}
        className="border-box-padding"
        testId={TestId.PickerHighlightPadding}
      />
      <div
        data-testid={TestId.PickerHighlightContent}
        className="absolute bg-box-content"
        style={rectStyle(layers.content)}
      />
    </div>
  )
}
