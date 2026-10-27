// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cssPathSelector, finderSelector, selectorFor } from '@/content/picker/selector'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cssPathSelector', () => {
  it('builds an nth-of-type chain below the root', () => {
    document.body.innerHTML = `
      <main><section></section><section><p></p><p><a></a><a></a></p></section></main>`
    const link = document.querySelectorAll('a')[1] as Element
    expect(cssPathSelector(link, document.body)).toBe(
      'main:nth-of-type(1) > section:nth-of-type(2) > p:nth-of-type(2) > a:nth-of-type(2)',
    )
    expect(cssPathSelector(document.body, document.body)).toBe('')
  })
})

describe('finderSelector', () => {
  it('prefers usable ids and classes and avoids generated ones', () => {
    document.body.innerHTML = `
      <main>
        <section class="grid">
          <article class="product-card Card_root__3xK9d">
            <h2>One</h2>
            <button type="button" class="card__cta sc-AxjAm">Add</button>
          </article>
          <article class="product-card Card_root__3xK9d">
            <h2>Two</h2>
            <button type="button" class="card__cta sc-AxjAm">Add</button>
          </article>
          <div id="root__3xK9d"><span id="price">1</span></div>
        </section>
      </main>`
    const second = document.querySelectorAll('button')[1] as Element
    const selector = finderSelector(second, document.body)
    expect(selector).not.toMatch(/3xK9d|sc-AxjAm/)
    expect(document.querySelectorAll(selector)).toHaveLength(1)
    expect(document.querySelector(selector)).toBe(second)

    expect(finderSelector(document.querySelector('#price') as Element, document.body)).toBe(
      '#price',
    )
    const hashedId = document.querySelector('#root__3xK9d') as Element
    expect(finderSelector(hashedId, document.body)).not.toContain('3xK9d')
  })

  it('scopes uniqueness to a shadow root', () => {
    document.body.innerHTML = `<p class="inner"></p><fx-card></fx-card>`
    const host = document.querySelector('fx-card') as Element
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `<div class="inner"><button>In</button></div>`
    const button = shadow.querySelector('button') as Element
    expect(finderSelector(button, shadow)).toBe('button')
    expect(selectorFor(button)).toBe('fx-card >>> button')
  })

  it('falls back to the structural chain when finder gives up', () => {
    document.body.innerHTML = `<main><p></p></main>`
    const p = document.querySelector('p') as Element
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(finderSelector(p, document.body)).toBe('main:nth-of-type(1) > p:nth-of-type(1)')
  })
})
