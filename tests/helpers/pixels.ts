import { inflateSync } from 'node:zlib'
import type { Page } from '@playwright/test'

/**
 * The colour of one screen pixel, `[r, g, b]`, read from a 1 × 1 screenshot. The snapshot canvas
 * sits in a closed shadow root — by design nothing on the page can read it — so a test checks
 * what is on screen instead. Decodes the PNG by hand (one pixel, one row: every filter type is
 * the identity), with Node's zlib; no image library needed.
 */
export async function screenPixel(
  page: Page,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  const png = await page.screenshot({
    clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 },
    animations: 'disabled',
  })
  return decodeSinglePixelPng(png)
}

export function decodeSinglePixelPng(png: Buffer): [number, number, number] {
  const signature = '89504e470d0a1a0a'
  if (png.subarray(0, 8).toString('hex') !== signature) throw new Error('not a PNG')
  let offset = 8
  let colorType = -1
  let bitDepth = -1
  const idat: Buffer[] = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      if (data.readUInt32BE(0) !== 1 || data.readUInt32BE(4) !== 1) {
        throw new Error('expected a 1 × 1 screenshot')
      }
      bitDepth = data[8] ?? -1
      colorType = data[9] ?? -1
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`)
  const channels = { 2: 3, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`)
  const row = inflateSync(Buffer.concat(idat))
  // row[0] is the filter type; for the first pixel of the first row every filter is the identity.
  return [row[1] ?? 0, row[2] ?? 0, row[3] ?? 0]
}
