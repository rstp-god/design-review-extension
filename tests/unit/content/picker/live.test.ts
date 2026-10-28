// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveSource, type LiveSource } from '@/content/picker/live'
import { buildPickerDom, type PickerDom } from './dom'

describe('LiveSource', () => {
  let dom: PickerDom
  let source: LiveSource

  beforeEach(() => {
    dom = buildPickerDom()
    source = createLiveSource({ host: dom.host })
  })

  afterEach(() => {
    dom.cleanup()
  })

  it('hands out one handle per element', () => {
    const a = source.nodeFor(dom.button)
    expect(source.nodeFor(dom.button)).toBe(a)
    expect(source.nodeFor(dom.heading)).not.toBe(a)
    expect(source.elementOf(a)).toBe(dom.button)
    expect(() => source.elementOf({ key: 'foreign' })).toThrow(/not a node/)
  })

  describe('hitTest', () => {
    it('returns the topmost page element and skips our host', () => {
      dom.stackAt([dom.host, dom.button, dom.article, document.body, document.documentElement])
      expect(source.hitTest(10, 10)).toBe(source.nodeFor(dom.button))
      expect(document.elementsFromPoint).toHaveBeenCalledWith(10, 10)
    })

    it('returns null outside the document or when only our UI is under the point', () => {
      dom.stackAt([])
      expect(source.hitTest(-5, -5)).toBeNull()
      dom.stackAt([dom.host])
      expect(source.hitTest(1, 1)).toBeNull()
    })

    it('descends into open shadow roots', () => {
      dom.stackAt([dom.openHost, dom.section, document.body])
      dom.openShadow.elementFromPoint = vi.fn(() => dom.openButton)
      expect(source.hitTest(20, 20)).toBe(source.nodeFor(dom.openButton))
      expect(dom.openShadow.elementFromPoint).toHaveBeenCalledWith(20, 20)
    })

    it('stops at the host when the shadow root reports nothing deeper', () => {
      dom.stackAt([dom.openHost])
      dom.openShadow.elementFromPoint = vi.fn(() => null)
      expect(source.hitTest(20, 20)).toBe(source.nodeFor(dom.openHost))
      dom.openShadow.elementFromPoint = vi.fn(() => dom.openHost)
      expect(source.hitTest(20, 20)).toBe(source.nodeFor(dom.openHost))
    })

    it('picks the host of a closed shadow root and an iframe as a whole', () => {
      dom.stackAt([dom.closedHost])
      expect(source.hitTest(30, 30)).toBe(source.nodeFor(dom.closedHost))
      dom.stackAt([dom.iframe, dom.main])
      expect(source.hitTest(40, 40)).toBe(source.nodeFor(dom.iframe))
    })

    it('resolves a path inside an svg to the svg itself', () => {
      dom.stackAt([dom.path, dom.path.parentElement as Element, dom.svg, dom.main])
      expect(source.hitTest(50, 50)).toBe(source.nodeFor(dom.svg))
      dom.stackAt([dom.svg, dom.main])
      expect(source.hitTest(50, 50)).toBe(source.nodeFor(dom.svg))
    })
  })

  describe('tree', () => {
    it('↑ goes to the parent and stops at body', () => {
      const button = source.nodeFor(dom.button)
      const article = source.parentOf(button)
      expect(article).toBe(source.nodeFor(dom.article))
      const body = source.nodeFor(document.body)
      expect(source.parentOf(source.nodeFor(dom.main))).toBe(body)
      expect(source.parentOf(body)).toBeNull()
      expect(source.parentOf(source.nodeFor(document.documentElement))).toBeNull()
    })

    it('↓ goes to the first rendered element child, skipping text and <style>', () => {
      expect(source.firstChildOf(source.nodeFor(dom.article))).toBe(source.nodeFor(dom.heading))
      expect(source.firstChildOf(source.nodeFor(dom.heading))).toBeNull()
      expect(source.firstChildOf(source.nodeFor(document.documentElement))).toBe(
        source.nodeFor(document.body),
      )
    })

    it('← → move between rendered siblings and never land on our host', () => {
      const heading = source.nodeFor(dom.heading)
      const price = source.nodeFor(dom.price)
      expect(source.nextSiblingOf(heading)).toBe(price)
      expect(source.previousSiblingOf(price)).toBe(heading)
      // <style> sits before <h2>: skipped, so there is no previous sibling.
      expect(source.previousSiblingOf(heading)).toBeNull()
      expect(source.nextSiblingOf(source.nodeFor(dom.button))).toBeNull()
      const body = source.nodeFor(document.body)
      expect(source.nextSiblingOf(body)).toBeNull()
      expect(source.previousSiblingOf(body)).toBeNull()
    })

    it('passes through open shadow roots and treats closed hosts and iframes as leaves', () => {
      const openHost = source.nodeFor(dom.openHost)
      const inner = source.nodeFor(dom.openInner)
      expect(source.firstChildOf(openHost)).toBe(inner)
      expect(source.parentOf(inner)).toBe(openHost)
      expect(source.parentOf(source.nodeFor(dom.openButton))).toBe(inner)
      expect(source.firstChildOf(source.nodeFor(dom.closedHost))).toBeNull()
      expect(source.firstChildOf(source.nodeFor(dom.iframe))).toBeNull()
      expect(source.firstChildOf(source.nodeFor(dom.svg))).toBeNull()
    })
  })

  it('builds breadcrumbs from body down, with usable ids and up to two usable classes', () => {
    const path = source.pathOf(source.nodeFor(dom.button))
    expect(path.map((entry) => entry.tag)).toEqual(['body', 'main', 'section', 'article', 'button'])
    expect(path[3]).toMatchObject({ id: 'card-1', classes: ['product-card'] })
    expect(path[4]).toMatchObject({ id: null, classes: ['card__cta'] })
    expect(path[4]?.node).toBe(source.nodeFor(dom.button))

    const shadowPath = source.pathOf(source.nodeFor(dom.openButton))
    expect(shadowPath.map((entry) => entry.tag)).toEqual([
      'body',
      'main',
      'section',
      'fx-open-card',
      'div',
      'button',
    ])
  })

  it('reads the rect, the box model and the computed styles', () => {
    dom.button.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 246, height: 40, right: 256, bottom: 60 }) as DOMRect
    dom.button.style.cssText =
      'margin: 16px 0 0; padding: 10px 16px; border: 2px solid red; color: rgb(255, 255, 255); display: flex'
    document.documentElement.style.fontSize = '10px'
    const node = source.nodeFor(dom.button)

    expect(source.rectOf(node)).toEqual({ x: 10, y: 20, w: 246, h: 40 })
    expect(source.boxModelOf(node)).toEqual({
      border: { x: 10, y: 20, w: 246, h: 40 },
      margin: { top: 16, right: 0, bottom: 0, left: 0 },
      borderWidth: { top: 2, right: 2, bottom: 2, left: 2 },
      padding: { top: 10, right: 16, bottom: 10, left: 16 },
    })

    const styles = source.stylesOf(node)
    expect(styles.rootFontSize).toBe(10)
    expect(styles.values.color).toBe('rgb(255, 255, 255)')
    expect(styles.values.display).toBe('flex')
    expect(styles.values['padding-left']).toBe('16px')
    expect(Object.keys(styles.values)).toContain('box-shadow')
  })

  it('reports visible frames as shield regions', () => {
    expect(source.shieldRects()).toEqual([])
    dom.iframe.getBoundingClientRect = () =>
      ({ left: 10, top: 300, width: 400, height: 160, right: 410, bottom: 460 }) as DOMRect
    expect(source.shieldRects()).toEqual([{ x: 10, y: 300, w: 400, h: 160 }])
  })

  it('falls back to 16px when the root font size is unreadable', () => {
    document.documentElement.style.fontSize = ''
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration)
    expect(source.stylesOf(source.nodeFor(dom.button)).rootFontSize).toBe(16)
  })

  it('produces short live selectors, joined with >>> through shadow roots', () => {
    expect(source.selectorOf(source.nodeFor(dom.button))).toEqual({
      selector: '.card__cta',
      source: 'live',
    })
    expect(source.selectorOf(source.nodeFor(dom.openButton)).selector).toBe(
      'fx-open-card >>> button',
    )
    const custom = createLiveSource({ host: dom.host, selector: (element) => element.localName })
    expect(custom.selectorOf(custom.nodeFor(dom.openButton)).selector).toBe(
      'fx-open-card >>> button',
    )
  })
})
