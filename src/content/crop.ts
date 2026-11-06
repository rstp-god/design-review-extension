import type { Rect } from '@/shared/model'

export interface CropGeometry {
  pixels: Rect
  clipped: boolean
  marker: { x: number; y: number }
}

/** Translate CSS pixels to actual bitmap pixels; the browser's capture scale may differ from DPR. */
export function cropGeometry(
  rect: Rect,
  viewport: { w: number; h: number },
  bitmap: { width: number; height: number },
  padding: number,
): CropGeometry | null {
  if (viewport.w <= 0 || viewport.h <= 0 || bitmap.width <= 0 || bitmap.height <= 0) return null
  const left = Math.max(0, rect.x)
  const top = Math.max(0, rect.y)
  const right = Math.min(viewport.w, rect.x + rect.w)
  const bottom = Math.min(viewport.h, rect.y + rect.h)
  if (right <= left || bottom <= top) return null
  const sx = bitmap.width / viewport.w
  const sy = bitmap.height / viewport.h
  const x = Math.max(0, Math.floor((left - padding) * sx))
  const y = Math.max(0, Math.floor((top - padding) * sy))
  const endX = Math.min(bitmap.width, Math.ceil((right + padding) * sx))
  const endY = Math.min(bitmap.height, Math.ceil((bottom + padding) * sy))
  return {
    pixels: { x, y, w: endX - x, h: endY - y },
    clipped:
      left !== rect.x || top !== rect.y || right !== rect.x + rect.w || bottom !== rect.y + rect.h,
    marker: { x: left * sx - x, y: top * sy - y },
  }
}

function marker(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  number: number,
  scale: number,
) {
  const radius = 12 * scale
  x = Math.min(ctx.canvas.width - radius, Math.max(radius, x + radius))
  y = Math.min(ctx.canvas.height - radius, Math.max(radius, y + radius))
  ctx.fillStyle = '#6236ff'
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${13 * scale}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), x, y)
}

async function asDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:image/webp;base64,${btoa(binary)}`
}

export async function prepareShots(
  bitmap: ImageBitmap,
  viewport: { w: number; h: number },
  rect: Rect,
  padding: number,
  quality: 'low' | 'medium' | 'high',
  number: number,
): Promise<{ crop: string; viewport: string; clipped: boolean }> {
  const geometry = cropGeometry(rect, viewport, bitmap, padding)
  if (!geometry) throw new Error('Target is outside the viewport')
  const p = geometry.pixels
  const canvas = new OffscreenCanvas(p.w, p.h)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h)
  marker(
    ctx,
    geometry.marker.x,
    geometry.marker.y,
    number,
    Math.min(bitmap.width / viewport.w, bitmap.height / viewport.h),
  )
  const ratio = Math.min(1, 480 / bitmap.width)
  const mini = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * ratio)),
    Math.max(1, Math.round(bitmap.height * ratio)),
  )
  const miniCtx = mini.getContext('2d')
  if (!miniCtx) throw new Error('Canvas unavailable')
  miniCtx.drawImage(bitmap, 0, 0, mini.width, mini.height)
  marker(
    miniCtx,
    (Math.max(0, rect.x) * mini.width) / viewport.w,
    (Math.max(0, rect.y) * mini.height) / viewport.h,
    number,
    1,
  )
  const q = { low: 0.55, medium: 0.75, high: 0.92 }[quality]
  const [crop, shot] = await Promise.all([
    canvas.convertToBlob({ type: 'image/webp', quality: q }),
    mini.convertToBlob({ type: 'image/webp', quality: q }),
  ])
  if (crop.type !== 'image/webp' || shot.type !== 'image/webp') throw new Error('WebP unavailable')
  return { crop: await asDataUrl(crop), viewport: await asDataUrl(shot), clipped: geometry.clipped }
}
