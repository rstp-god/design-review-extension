import { vi } from 'vitest'

/**
 * A page for picker unit tests (jsdom): the fixture site's structure with an open and a closed
 * shadow root, an iframe, a non-rendered `<style>` inside the card and our overlay host on `<html>`.
 * jsdom has no hit testing, so `elementsFromPoint` / `elementFromPoint` are stubs the tests feed.
 */
export interface PickerDom {
  host: HTMLElement
  main: HTMLElement
  section: HTMLElement
  article: HTMLElement
  heading: HTMLElement
  price: HTMLElement
  button: HTMLElement
  openHost: HTMLElement
  openShadow: ShadowRoot
  openInner: HTMLElement
  openButton: HTMLElement
  closedHost: HTMLElement
  closedButton: HTMLElement
  iframe: HTMLIFrameElement
  svg: SVGSVGElement
  path: SVGPathElement
  /** Replaces `document.elementsFromPoint` for the next hit test. */
  stackAt: (stack: Element[]) => void
  cleanup: () => void
}

export function buildPickerDom(): PickerDom {
  document.body.innerHTML = `
    <main>
      <section class="grid">
        <article class="product-card Card_root__3xK9d" id="card-1">
          <style>.x{}</style>
          <h2>Product one</h2>
          <p class="product-card__price">12 990 ₽</p>
          <button type="button" class="card__cta sc-AxjAm">Add to cart</button>
        </article>
        <fx-open-card></fx-open-card>
        <fx-closed-card></fx-closed-card>
      </section>
      <iframe class="frame" title="frame"></iframe>
      <svg class="icon" viewBox="0 0 24 24"><g><path d="M0 0h24v24H0z"></path></g></svg>
    </main>`

  const host = document.createElement('dr-overlay')
  document.documentElement.append(host)

  const q = <T extends Element>(selector: string) => document.querySelector(selector) as T
  const openHost = q<HTMLElement>('fx-open-card')
  const openShadow = openHost.attachShadow({ mode: 'open' })
  openShadow.innerHTML = `<div class="inner"><p>Open</p><button type="button">Inside open</button></div>`
  const closedHost = q<HTMLElement>('fx-closed-card')
  const closedShadow = closedHost.attachShadow({ mode: 'closed' })
  closedShadow.innerHTML = `<div class="inner"><button type="button">Inside closed</button></div>`

  const elementsFromPoint = vi.fn<(x: number, y: number) => Element[]>(() => [])
  document.elementsFromPoint = elementsFromPoint

  return {
    host,
    main: q('main'),
    section: q('section'),
    article: q('article'),
    heading: q('h2'),
    price: q('p'),
    button: q('button'),
    openHost,
    openShadow,
    openInner: openShadow.querySelector('.inner') as HTMLElement,
    openButton: openShadow.querySelector('button') as HTMLElement,
    closedHost,
    closedButton: closedShadow.querySelector('button') as HTMLElement,
    iframe: q('iframe'),
    svg: q('svg'),
    path: q('path'),
    stackAt: (stack) => {
      elementsFromPoint.mockReturnValue(stack)
    },
    cleanup: () => {
      host.remove()
      document.body.innerHTML = ''
    },
  }
}
