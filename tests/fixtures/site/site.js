/*
 * Fixture behaviour. External file on purpose: every page ships a strict CSP (`script-src 'self'`),
 * so inline scripts would not run.
 */

/** Open and closed shadow roots for the picker tests (spec F3.6). */
class OpenCard extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = `
      <style>
        .inner { padding: 1.2rem; border: 2px solid #0a9396; border-radius: 0.6rem; background: #e0fbfc; }
        button { background: #0a9396; color: #fff; border: 0; padding: 0.6rem 1.2rem; }
      </style>
      <div class="inner">
        <p>Open shadow root</p>
        <button type="button" data-fixture="open-shadow-button">Inside open shadow</button>
      </div>`
  }
}

class ClosedCard extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'closed' })
    root.innerHTML = `
      <style>
        .inner { padding: 1.2rem; border: 2px solid #9b2226; border-radius: 0.6rem; background: #ffe8e6; }
      </style>
      <div class="inner">
        <p>Closed shadow root</p>
        <button type="button">Inside closed shadow</button>
      </div>`
  }
}

customElements.define('fx-open-card', OpenCard)
customElements.define('fx-closed-card', ClosedCard)

/** Click counter: proves (later) that the picker blocks page clicks. */
const counter = document.querySelector('[data-fixture="counter"]')
if (counter) {
  let clicks = 0
  counter.addEventListener('click', () => {
    clicks += 1
    counter.textContent = `Clicked ${clicks}`
    document.documentElement.dataset.clicks = String(clicks)
  })
}

/** Tiny SPA router: pushState on link clicks, popstate on Back, replaceState button. */
const view = document.querySelector('[data-fixture="spa-view"]')
if (view) {
  const render = () => {
    view.textContent = `View: ${location.pathname}`
    document.documentElement.dataset.spaPath = location.pathname
  }
  for (const link of document.querySelectorAll('a[data-spa]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      history.pushState({}, '', link.getAttribute('href'))
      render()
    })
  }
  document.querySelector('[data-fixture="spa-replace"]')?.addEventListener('click', () => {
    history.replaceState({}, '', '/spa/replaced')
    render()
  })
  window.addEventListener('popstate', render)
  render()
}

/** ~3000 nodes for the picker performance check (spec 3.3 AC, 4.2): 500 cards × 6 elements. */
const heavyRoot = document.querySelector('[data-fixture="heavy-root"]')
if (heavyRoot) {
  const fragment = document.createDocumentFragment()
  for (let i = 1; i <= 500; i += 1) {
    const card = document.createElement('article')
    card.className = 'product-card heavy-card'
    const title = document.createElement('h2')
    title.textContent = `Product ${i}`
    const price = document.createElement('p')
    price.className = 'product-card__price'
    price.textContent = `${(i * 37) % 9000} ₽`
    const meta = document.createElement('div')
    meta.className = 'heavy-meta'
    const sku = document.createElement('span')
    sku.textContent = `SKU-${1000 + i}`
    const stock = document.createElement('span')
    stock.textContent = i % 3 === 0 ? 'out of stock' : 'in stock'
    meta.append(sku, stock)
    const cta = document.createElement('button')
    cta.type = 'button'
    cta.className = 'card__cta'
    cta.textContent = 'Add'
    card.append(title, price, meta, cta)
    fragment.append(card)
  }
  heavyRoot.append(fragment)
  document.documentElement.dataset.heavyNodes = String(document.querySelectorAll('*').length)
}
