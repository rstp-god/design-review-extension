// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLiveSource, type LiveSource } from '@/content/picker/live'
import { isArrowKey, navigateFrom } from '@/content/picker/navigation'
import { buildPickerDom, type PickerDom } from './dom'

describe('navigateFrom', () => {
  let dom: PickerDom
  let source: LiveSource

  beforeEach(() => {
    dom = buildPickerDom()
    source = createLiveSource({ host: dom.host })
  })

  afterEach(() => {
    dom.cleanup()
  })

  it('walks the tree with the arrow keys', () => {
    const button = source.nodeFor(dom.button)
    const article = navigateFrom(source, button, 'ArrowUp')
    expect(article).toBe(source.nodeFor(dom.article))
    const heading = navigateFrom(source, article as never, 'ArrowDown')
    expect(heading).toBe(source.nodeFor(dom.heading))
    const price = navigateFrom(source, heading as never, 'ArrowRight')
    expect(price).toBe(source.nodeFor(dom.price))
    expect(navigateFrom(source, price as never, 'ArrowLeft')).toBe(heading)
  })

  it('returns null where there is nowhere to go', () => {
    expect(navigateFrom(source, source.nodeFor(document.body), 'ArrowUp')).toBeNull()
    expect(navigateFrom(source, source.nodeFor(dom.heading), 'ArrowDown')).toBeNull()
    expect(navigateFrom(source, source.nodeFor(dom.button), 'ArrowRight')).toBeNull()
  })

  it('recognises arrow keys', () => {
    expect(isArrowKey('ArrowUp')).toBe(true)
    expect(isArrowKey('Enter')).toBe(false)
  })
})
