// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { descriptorPart, selectorFromDescriptors } from '@/content/snapshot/descriptor'
import { descriptorChain, type SnapshotNode, walkSnapshot } from '@/content/snapshot/walk'
import type { Rect } from '@/shared/model'

const VIEWPORT = { w: 1280, h: 720 }

/**
 * jsdom lays nothing out: every element gets the rect the test assigns (zero otherwise), and
 * computed values the test cannot express inline (`content-visibility`) are overlaid per element.
 */
function setup() {
  document.body.innerHTML = `
    <main>
      <header class="header">
        <a href="/">Fixture</a>
        <div class="menu">
          <div class="menu__dropdown"><a href="/catalog/">Catalog</a></div>
        </div>
      </header>
      <section class="grid">
        <article class="product-card Card_root__3xK9d" id="card-1">
          <style>.x{}</style>
          <h2>Product one</h2>
          <p class="product-card__price">12 990</p>
          <button type="button" class="card__cta sc-AxjAm">Add to cart</button>
        </article>
        <article class="product-card"><h2>Product two</h2></article>
        <fx-open-card><span class="slotted">Slotted</span></fx-open-card>
        <fx-closed-card></fx-closed-card>
      </section>
      <div class="hidden"><p>hidden</p></div>
      <div class="ghost"><span class="visible-child">visible</span></div>
      <div class="transparent"><p>transparent</p></div>
      <div class="scroller"><p class="inside">in</p><p class="outside">out</p></div>
      <div class="offscreen"><p>far below</p></div>
      <div class="gone"><p>no size, no children</p></div>
      <iframe class="frame" title="frame"></iframe>
      <svg class="icon"><path d="M0 0"></path></svg>
      <div class="cv"><p>unrendered contents</p></div>
    </main>`

  const host = document.createElement('dr-overlay')
  document.documentElement.append(host)

  const q = <T extends Element>(selector: string) => document.querySelector(selector) as T
  const openHost = q<HTMLElement>('fx-open-card')
  const openShadow = openHost.attachShadow({ mode: 'open' })
  openShadow.innerHTML = `<div class="inner"><button type="button">Inside open</button><slot></slot></div>`
  const closedHost = q<HTMLElement>('fx-closed-card')
  closedHost.attachShadow({ mode: 'closed' }).innerHTML = `<div class="inner">closed</div>`

  const rects = new Map<Element, Rect>()
  const rect = (element: Element, value: Rect) => rects.set(element, value)
  const full = { x: 0, y: 0, w: 1280, h: 2000 }
  rect(document.documentElement, full)
  rect(document.body, full)
  rect(q('main'), { x: 0, y: 0, w: 1280, h: 1900 })
  rect(q('header'), { x: 0, y: 0, w: 1280, h: 56 })
  rect(q('header > a'), { x: 24, y: 16, w: 60, h: 24 })
  rect(q('.menu'), { x: 100, y: 16, w: 80, h: 24 })
  rect(q('.menu__dropdown'), { x: 100, y: 56, w: 200, h: 120 })
  rect(q('.menu__dropdown a'), { x: 100, y: 64, w: 200, h: 32 })
  rect(q('section'), { x: 24, y: 100, w: 1232, h: 300 })
  rect(q('#card-1'), { x: 24, y: 100, w: 400, h: 300 })
  rect(q('#card-1 h2'), { x: 40, y: 116, w: 368, h: 30 })
  rect(q('#card-1 p'), { x: 40, y: 150, w: 368, h: 24 })
  rect(q('#card-1 button'), { x: 40, y: 200, w: 120, h: 40 })
  rect(q('article:nth-of-type(2)'), { x: 440, y: 100, w: 400, h: 300 })
  rect(q('article:nth-of-type(2) h2'), { x: 456, y: 116, w: 368, h: 30 })
  rect(openHost, { x: 856, y: 100, w: 200, h: 100 })
  rect(openShadow.querySelector('.inner') as Element, { x: 856, y: 100, w: 200, h: 100 })
  rect(openShadow.querySelector('button') as Element, { x: 866, y: 110, w: 100, h: 30 })
  rect(q('.slotted'), { x: 866, y: 150, w: 100, h: 20 })
  rect(closedHost, { x: 1070, y: 100, w: 180, h: 100 })
  rect(q('.hidden'), { x: 0, y: 420, w: 100, h: 20 })
  rect(q('.ghost'), { x: 0, y: 450, w: 300, h: 40 })
  rect(q('.visible-child'), { x: 10, y: 455, w: 100, h: 20 })
  rect(q('.transparent'), { x: 0, y: 500, w: 300, h: 40 })
  rect(q('.transparent p'), { x: 0, y: 500, w: 300, h: 40 })
  rect(q('.scroller'), { x: 0, y: 550, w: 200, h: 60 })
  rect(q('.inside'), { x: 10, y: 560, w: 100, h: 20 })
  rect(q('.outside'), { x: 10, y: 640, w: 100, h: 20 })
  rect(q('.offscreen'), { x: 0, y: 3000, w: 300, h: 40 })
  rect(q('.offscreen p'), { x: 0, y: 3000, w: 300, h: 20 })
  rect(q('iframe'), { x: 0, y: 620, w: 400, h: 90 })
  rect(q('svg'), { x: 500, y: 620, w: 24, h: 24 })
  rect(q('path'), { x: 500, y: 620, w: 24, h: 24 })
  rect(q('.cv'), { x: 600, y: 620, w: 200, h: 40 })
  rect(q('.cv p'), { x: 600, y: 620, w: 200, h: 20 })

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

  const header = q<HTMLElement>('header')
  header.style.position = 'fixed'
  header.style.zIndex = '1000'
  q<HTMLElement>('.menu').style.position = 'relative'
  q<HTMLElement>('.menu__dropdown').style.position = 'absolute'
  q<HTMLElement>('.hidden').style.display = 'none'
  q<HTMLElement>('.ghost').style.visibility = 'hidden'
  q<HTMLElement>('.visible-child').style.visibility = 'visible'
  q<HTMLElement>('.transparent').style.opacity = '0'
  q<HTMLElement>('.scroller').style.overflowX = 'hidden'
  q<HTMLElement>('.scroller').style.overflowY = 'hidden'
  q<HTMLElement>('#card-1 button').style.cssText =
    'color: rgb(255, 255, 255); font-size: 14px; padding: 10px 16px; margin: 16px 0 0; border: 2px solid red'
  document.documentElement.style.fontSize = '10px'

  const overrides = new Map<Element, Record<string, string>>([
    [q('.cv'), { 'content-visibility': 'hidden' }],
  ])
  const realComputed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const computed = realComputed(element)
    const extra = overrides.get(element)
    if (!extra) return computed
    return {
      getPropertyValue: (name: string) => extra[name] ?? computed.getPropertyValue(name),
    } as CSSStyleDeclaration
  })

  return { host, q, openShadow, closedHost }
}

describe('walkSnapshot', () => {
  let dom: ReturnType<typeof setup>
  let result: ReturnType<typeof walkSnapshot>
  const byElement = (element: Element) =>
    result.nodes.find((node) => node.element.deref() === element)
  const node = (selector: string) => byElement(dom.q(selector)) as SnapshotNode

  beforeEach(() => {
    dom = setup()
    result = walkSnapshot({
      root: document,
      host: dom.host,
      viewport: VIEWPORT,
      fields: ['colors'],
    })
  })

  afterEach(() => {
    dom.host.remove()
    document.body.innerHTML = ''
    document.documentElement.style.fontSize = ''
  })

  it('keeps the rendered tree in document order with parents linked', () => {
    expect(result.nodes.map((entry) => entry.order)).toEqual(
      [...result.nodes].sort((a, b) => a.order - b.order).map((entry) => entry.order),
    )
    const button = node('#card-1 button')
    expect(button.parent).toBe(node('#card-1'))
    expect(node('#card-1').children).toEqual([node('#card-1 h2'), node('#card-1 p'), button])
    expect(node('body').parent).toBe(node('html'))
    expect(node('html').parent).toBeNull()
  })

  it('leaves out our host, non-rendered tags and display: none / opacity: 0 subtrees', () => {
    expect(byElement(dom.host)).toBeUndefined()
    expect(byElement(dom.q('style'))).toBeUndefined()
    expect(byElement(dom.q('.hidden'))).toBeUndefined()
    expect(byElement(dom.q('.hidden p'))).toBeUndefined()
    expect(byElement(dom.q('.transparent'))).toBeUndefined()
    expect(byElement(dom.q('.transparent p'))).toBeUndefined()
  })

  it('drops boxes that show nothing and have nothing visible below them', () => {
    expect(byElement(dom.q('.offscreen'))).toBeUndefined()
    expect(byElement(dom.q('.gone'))).toBeUndefined()
    // Clipped by its overflow parent: not even a tree box, it has no children.
    expect(byElement(dom.q('.outside'))).toBeUndefined()
    expect(node('.inside').hittable).toBe(true)
    expect(node('.inside').visibleRect).toEqual({ x: 10, y: 560, w: 100, h: 20 })
  })

  it('keeps a hidden parent for the tree when a child is visible', () => {
    const ghost = node('.ghost')
    expect(ghost.hittable).toBe(false)
    expect(ghost.rank).toBe(-1)
    expect(ghost.styles).toEqual({})
    const child = node('.visible-child')
    expect(child.hittable).toBe(true)
    expect(child.parent).toBe(ghost)
  })

  it('treats iframes and svg as leaves and skips the contents of content-visibility: hidden', () => {
    expect(node('iframe').children).toEqual([])
    expect(node('svg').hittable).toBe(true)
    expect(byElement(dom.q('path'))).toBeUndefined()
    expect(node('.cv').hittable).toBe(true)
    expect(node('.cv').children).toEqual([])
    expect(byElement(dom.q('.cv p'))).toBeUndefined()
  })

  it('walks open shadow roots and slots, and stops at a closed host', () => {
    const openHost = node('fx-open-card')
    const inner = byElement(dom.openShadow.querySelector('.inner') as Element) as SnapshotNode
    const innerButton = byElement(dom.openShadow.querySelector('button') as Element) as SnapshotNode
    expect(openHost.children[0]).toBe(inner)
    expect(inner.shadowHost).toBe(openHost)
    expect(innerButton.shadowHost).toBe(openHost)
    expect(openHost.shadowHost).toBeNull()
    // A slotted element paints inside the shadow tree but belongs to the host's light tree.
    const slotted = node('.slotted')
    expect(slotted.hittable).toBe(true)
    expect(slotted.parent).toBe(openHost)
    expect(slotted.shadowHost).toBeNull()
    expect(openHost.children).toContain(slotted)
    expect(selectorFromDescriptors(descriptorChain(slotted))).toBe(
      'main > section.grid > fx-open-card > span.slotted',
    )
    expect(byElement(dom.openShadow.querySelector('slot') as Element)).toBeUndefined()

    expect(node('fx-closed-card').children).toEqual([])
    expect(node('fx-closed-card').hittable).toBe(true)
  })

  it('captures the required styles plus the enabled fields for hittable boxes only', () => {
    const button = node('#card-1 button')
    expect(button.styles['padding-left']).toBe('16px')
    expect(button.styles['border-top-width']).toBe('2px')
    expect(button.styles.color).toBe('rgb(255, 255, 255)')
    expect(button.styles['font-family']).toBeUndefined()
    expect(button.box).toEqual({
      margin: { top: 16, right: 0, bottom: 0, left: 0 },
      borderWidth: { top: 2, right: 2, bottom: 2, left: 2 },
      padding: { top: 10, right: 16, bottom: 10, left: 16 },
    })
    expect(result.rootFontSize).toBe(10)
  })

  it('describes each box: usable id and classes, nth-of-type only among same-tag siblings', () => {
    expect(node('#card-1').descriptor).toEqual({
      tag: 'article',
      id: 'card-1',
      classes: ['product-card'],
      nthOfType: 1,
      hasSameTagSiblings: true,
    })
    expect(node('article:nth-of-type(2)').descriptor).toMatchObject({
      nthOfType: 2,
      hasSameTagSiblings: true,
    })
    expect(node('#card-1 button').descriptor).toEqual({
      tag: 'button',
      id: null,
      classes: ['card__cta'],
      nthOfType: 1,
      hasSameTagSiblings: false,
    })
    // `<style>` counts as a sibling for :nth-of-type, but it has its own tag: h2 is alone.
    expect(node('#card-1 h2').descriptor.hasSameTagSiblings).toBe(false)
  })

  it('builds readable selectors from the descriptor chain, from the deepest id down', () => {
    expect(descriptorChain(node('#card-1 button')).map(descriptorPart)).toEqual([
      'main',
      'section.grid',
      '#card-1',
      'button.card__cta',
    ])
    expect(selectorFromDescriptors(descriptorChain(node('#card-1 button')))).toBe(
      '#card-1 > button.card__cta',
    )
    expect(selectorFromDescriptors(descriptorChain(node('article:nth-of-type(2) h2')))).toBe(
      'main > section.grid > article.product-card:nth-of-type(2) > h2',
    )
    expect(selectorFromDescriptors(descriptorChain(node('body')))).toBe('body')
    expect(selectorFromDescriptors(descriptorChain(node('html')))).toBe('html')
    // Inside a shadow root the chain starts at the shadow tree, not at the host.
    const innerButton = byElement(dom.openShadow.querySelector('button') as Element) as SnapshotNode
    expect(selectorFromDescriptors(descriptorChain(innerButton))).toBe('div.inner > button')
  })

  it('ranks the fixed header and its dropdown above the content, in-flow boxes by document order', () => {
    const rankOf = (selector: string) => node(selector).rank
    expect(rankOf('header')).toBeGreaterThan(rankOf('#card-1 button'))
    expect(rankOf('.menu__dropdown a')).toBeGreaterThan(rankOf('.menu__dropdown'))
    expect(rankOf('.menu__dropdown')).toBeGreaterThan(rankOf('header'))
    expect(rankOf('#card-1 button')).toBeGreaterThan(rankOf('#card-1'))
    expect(rankOf('article:nth-of-type(2)')).toBeGreaterThan(rankOf('#card-1 button'))
    expect(rankOf('body')).toBeGreaterThan(rankOf('html'))
    expect(result.hittable.map((entry) => entry.rank)).toEqual(
      result.hittable.map((_, index) => index),
    )
    expect(result.hittable.every((entry) => entry.hittable)).toBe(true)
  })

  it('reports counts and timings', () => {
    expect(result.visited).toBeGreaterThan(result.nodes.length)
    expect(result.timings.walkMs).toBeGreaterThanOrEqual(0)
    expect(result.timings.stylesMs).toBeGreaterThanOrEqual(0)
    expect(result.timings.rankMs).toBeGreaterThanOrEqual(0)
    expect(result.timings.walkMs).toBeGreaterThanOrEqual(result.timings.stylesMs)
  })

  it('falls back to 16px when the root font size is unreadable', () => {
    document.documentElement.style.fontSize = ''
    const again = walkSnapshot({ root: document, host: dom.host, viewport: VIEWPORT, fields: [] })
    expect(again.rootFontSize).toBe(16)
  })
})
