// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotSource, type SnapshotSource } from '@/content/picker/snapshot'
import { type SnapshotNode, walkSnapshot } from '@/content/snapshot/walk'
import type { Rect } from '@/shared/model'

const VIEWPORT = { w: 1280, h: 720 }

/**
 * A page frozen by the walk: a fixed header with an absolutely positioned dropdown over a card,
 * a hidden wrapper with a visible child, an open shadow root. Rects are assigned by hand.
 */
function setup() {
  document.body.innerHTML = `
    <main>
      <header class="header">
        <div class="menu">
          <a class="trigger" href="/catalog/">Hover menu</a>
          <div class="menu__dropdown"><a class="item" href="/cart/">Cart</a></div>
        </div>
      </header>
      <section class="grid">
        <article class="product-card" id="card-1">
          <h2>Product one</h2>
          <p class="product-card__price">12 990</p>
          <button type="button" class="card__cta">Add to cart</button>
        </article>
        <article class="product-card"><h2>Product two</h2></article>
        <fx-open-card></fx-open-card>
      </section>
      <div class="ghost"><span class="visible-child">visible</span></div>
    </main>`
  const host = document.createElement('dr-overlay')
  document.documentElement.append(host)

  const q = <T extends Element>(selector: string) => document.querySelector(selector) as T
  const openHost = q<HTMLElement>('fx-open-card')
  const openShadow = openHost.attachShadow({ mode: 'open' })
  openShadow.innerHTML = `<div class="inner"><button type="button">Inside open</button></div>`

  const rects = new Map<Element, Rect>()
  const rect = (element: Element, value: Rect) => rects.set(element, value)
  rect(document.documentElement, { x: 0, y: 0, w: 1280, h: 2000 })
  rect(document.body, { x: 0, y: 0, w: 1280, h: 2000 })
  rect(q('main'), { x: 0, y: 0, w: 1280, h: 1900 })
  rect(q('header'), { x: 0, y: 0, w: 1280, h: 56 })
  rect(q('.menu'), { x: 100, y: 16, w: 80, h: 24 })
  rect(q('.trigger'), { x: 100, y: 16, w: 80, h: 24 })
  rect(q('.menu__dropdown'), { x: 100, y: 56, w: 200, h: 120 })
  rect(q('.item'), { x: 100, y: 64, w: 200, h: 32 })
  rect(q('section'), { x: 24, y: 40, w: 1232, h: 400 })
  rect(q('#card-1'), { x: 24, y: 40, w: 400, h: 300 })
  rect(q('#card-1 h2'), { x: 40, y: 60, w: 368, h: 30 })
  rect(q('#card-1 p'), { x: 40, y: 100, w: 368, h: 24 })
  rect(q('#card-1 button'), { x: 40, y: 200, w: 120, h: 40 })
  rect(q('article:nth-of-type(2)'), { x: 440, y: 40, w: 400, h: 300 })
  rect(q('article:nth-of-type(2) h2'), { x: 456, y: 60, w: 368, h: 30 })
  rect(openHost, { x: 856, y: 40, w: 200, h: 100 })
  rect(openShadow.querySelector('.inner') as Element, { x: 856, y: 40, w: 200, h: 100 })
  rect(openShadow.querySelector('button') as Element, { x: 866, y: 50, w: 100, h: 30 })
  rect(q('.ghost'), { x: 0, y: 500, w: 300, h: 40 })
  rect(q('.visible-child'), { x: 10, y: 505, w: 100, h: 20 })

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

  q<HTMLElement>('header').style.cssText = 'position: fixed; z-index: 1000'
  q<HTMLElement>('.menu').style.position = 'relative'
  q<HTMLElement>('.menu__dropdown').style.position = 'absolute'
  q<HTMLElement>('.ghost').style.visibility = 'hidden'
  q<HTMLElement>('.visible-child').style.visibility = 'visible'
  // jsdom does not expand the `border-radius` shorthand: the longhands the walk reads are set.
  q<HTMLElement>('#card-1 button').style.cssText =
    'color: rgb(255, 255, 255); padding: 10px 16px; margin: 16px 0 0; border: 2px solid red; ' +
    'border-top-left-radius: 50%; border-top-right-radius: 50%; ' +
    'border-bottom-right-radius: 50%; border-bottom-left-radius: 50%'
  document.documentElement.style.fontSize = '10px'

  const walk = walkSnapshot({ root: document, host, viewport: VIEWPORT, fields: ['colors'] })
  return { host, q, openShadow, walk }
}

describe('SnapshotSource', () => {
  let dom: ReturnType<typeof setup>
  let source: SnapshotSource
  const nodeOf = (element: Element) =>
    dom.walk.nodes.find((node) => node.element.deref() === element) as SnapshotNode
  const node = (selector: string) => nodeOf(dom.q(selector))

  beforeEach(() => {
    dom = setup()
    source = createSnapshotSource({
      nodes: dom.walk.nodes,
      hittable: dom.walk.hittable,
      rootFontSize: dom.walk.rootFontSize,
      viewport: VIEWPORT,
      selector: (element) => `${element.localName}${element.id ? `#${element.id}` : ''}`,
    })
  })

  afterEach(() => {
    source.dispose()
    dom.host.remove()
    document.body.innerHTML = ''
    document.documentElement.style.fontSize = ''
  })

  it('hit-tests by paint rank: the dropdown item wins over the card under it', () => {
    // (150, 80) is inside the dropdown item, the dropdown, the header and the card's h2.
    expect(source.hitTest(150, 80)).toBe(node('.item'))
    // The header beats the section it overlaps.
    expect(source.hitTest(600, 50)).toBe(node('header'))
    // Deepest in-flow box wins where nothing positioned is on top.
    expect(source.hitTest(60, 210)).toBe(node('#card-1 button'))
    expect(source.hitTest(60, 70)).toBe(node('#card-1 h2'))
    expect(source.hitTest(300, 320)).toBe(node('#card-1'))
    // Open shadow content is a target of its own.
    expect(source.hitTest(900, 60)).toBe(nodeOf(dom.openShadow.querySelector('button') as Element))
  })

  it('misses the cut-off corner of a rounded box and lands on what is behind', () => {
    // The button (40,200 120×40) is an ellipse: its corner pixel belongs to the card.
    expect(source.hitTest(100, 220)).toBe(node('#card-1 button'))
    expect(source.hitTest(41, 201)).toBe(node('#card-1'))
    expect(node('#card-1 button').radii?.[0]).toEqual({ rx: 60, ry: 20 })
    expect(node('#card-1').radii).toBeNull()
  })

  it('never returns a tree-only box, and null outside the viewport', () => {
    expect(source.hitTest(200, 520)).toBe(node('main'))
    expect(source.hitTest(20, 510)).toBe(node('.visible-child'))
    expect(source.hitTest(-1, 10)).toBeNull()
    expect(source.hitTest(10, 721)).toBeNull()
  })

  it('reads geometry, box model and styles from the frozen nodes', () => {
    const button = node('#card-1 button')
    expect(source.rectOf(button)).toEqual({ x: 40, y: 200, w: 120, h: 40 })
    expect(source.boxModelOf(button)).toEqual({
      border: { x: 40, y: 200, w: 120, h: 40 },
      margin: { top: 16, right: 0, bottom: 0, left: 0 },
      borderWidth: { top: 2, right: 2, bottom: 2, left: 2 },
      padding: { top: 10, right: 16, bottom: 10, left: 16 },
    })
    const styles = source.stylesOf(button)
    expect(styles.rootFontSize).toBe(10)
    expect(styles.values.color).toBe('rgb(255, 255, 255)')
    expect(styles.values['font-family']).toBeUndefined()
  })

  it('navigates the frozen tree and stops at body going up', () => {
    const button = node('#card-1 button')
    expect(source.parentOf(button)).toBe(node('#card-1'))
    expect(source.firstChildOf(node('#card-1'))).toBe(node('#card-1 h2'))
    expect(source.nextSiblingOf(node('#card-1 h2'))).toBe(node('#card-1 p'))
    expect(source.previousSiblingOf(node('#card-1 p'))).toBe(node('#card-1 h2'))
    expect(source.previousSiblingOf(node('#card-1 h2'))).toBeNull()
    expect(source.nextSiblingOf(button)).toBeNull()
    expect(source.firstChildOf(button)).toBeNull()
    expect(source.parentOf(node('main'))).toBe(node('body'))
    expect(source.parentOf(node('body'))).toBeNull()
    expect(source.nextSiblingOf(node('body'))).toBeNull()
    // Tree-only boxes are reachable with the arrows, as with the live DOM.
    expect(source.parentOf(node('.visible-child'))).toBe(node('.ghost'))
    expect(source.firstChildOf(node('fx-open-card'))).toBe(
      nodeOf(dom.openShadow.querySelector('.inner') as Element),
    )
  })

  it('builds breadcrumbs from body down with the descriptors', () => {
    const path = source.pathOf(node('#card-1 button'))
    expect(path.map((entry) => entry.tag)).toEqual(['body', 'main', 'section', 'article', 'button'])
    expect(path[3]).toMatchObject({ id: 'card-1', classes: ['product-card'] })
    expect(path[4]?.node).toBe(node('#card-1 button'))
  })

  it('uses the live selector while the element is in the document, the descriptors once it is gone', () => {
    const button = node('#card-1 button')
    expect(source.selectorOf(button)).toEqual({ selector: 'button', source: 'live' })

    const h2 = node('article:nth-of-type(2) h2')
    dom.q('article:nth-of-type(2)').remove()
    expect(source.selectorOf(h2)).toEqual({
      selector: 'main > section.grid > article.product-card:nth-of-type(2) > h2',
      source: 'snapshot',
    })

    const inner = nodeOf(dom.openShadow.querySelector('button') as Element)
    expect(source.selectorOf(inner)).toEqual({
      selector: 'fx-open-card >>> button',
      source: 'live',
    })
    // The host leaves the document: a node not asked before falls back through the shadow boundary.
    const innerDiv = nodeOf(dom.openShadow.querySelector('.inner') as Element)
    dom.q('fx-open-card').remove()
    expect(source.selectorOf(innerDiv)).toEqual({
      selector: 'main > section.grid > fx-open-card >>> div.inner',
      source: 'snapshot',
    })
    // Already computed selectors are cached for the life of the snapshot.
    expect(source.selectorOf(inner).source).toBe('live')
  })

  it('caches a selector per node', () => {
    const generate = vi.fn((element: Element) => element.localName)
    const cached = createSnapshotSource({
      nodes: dom.walk.nodes,
      hittable: dom.walk.hittable,
      rootFontSize: 16,
      viewport: VIEWPORT,
      selector: generate,
    })
    cached.selectorOf(node('#card-1 button'))
    cached.selectorOf(node('#card-1 button'))
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('shields the whole viewport and rejects foreign nodes', () => {
    expect(source.shieldRects()).toEqual([{ x: 0, y: 0, w: 1280, h: 720 }])
    expect(() => source.rectOf({ key: 'foreign' })).toThrow(/not a node of the snapshot/)
    expect(source.kind).toBe('snapshot')
  })
})
