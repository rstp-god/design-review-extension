import { describe, expect, it } from 'vitest'
import { isRestrictedUrl, normalizePath, sessionKey } from '@/shared/sessionKey'

describe('normalizePath', () => {
  it.each([
    ['/catalog', '/catalog'],
    ['/catalog/', '/catalog'],
    ['/catalog//', '/catalog'],
    ['//catalog//items/', '/catalog/items'],
    ['/', '/'],
    ['', '/'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected)
  })
})

describe('sessionKey — domain scope (AC 3.1)', () => {
  it('two pages of one site share a session', () => {
    expect(sessionKey('https://shop.ru/catalog', 'domain')).toBe(
      sessionKey('https://shop.ru/cart', 'domain'),
    )
  })

  it('subdomains, ports, schemes and www are different sessions', () => {
    expect(sessionKey('https://shop.example.ru/', 'domain')).not.toBe(
      sessionKey('https://example.ru/', 'domain'),
    )
    expect(sessionKey('http://localhost:3000/', 'domain')).not.toBe(
      sessionKey('http://localhost:5173/', 'domain'),
    )
    expect(sessionKey('http://shop.ru/', 'domain')).not.toBe(
      sessionKey('https://shop.ru/', 'domain'),
    )
    expect(sessionKey('https://www.shop.ru/', 'domain')).not.toBe(
      sessionKey('https://shop.ru/', 'domain'),
    )
  })

  it('is the origin', () => {
    expect(sessionKey('https://shop.ru/catalog?page=2#top', 'domain')).toBe('https://shop.ru')
    expect(sessionKey(new URL('http://localhost:5173/a/b'), 'domain')).toBe('http://localhost:5173')
  })
})

describe('sessionKey — page scope (AC 3.1)', () => {
  it('ignores query, hash and the trailing slash', () => {
    const expected = 'https://shop.ru/catalog'
    expect(sessionKey('https://shop.ru/catalog?page=2#top', 'page')).toBe(expected)
    expect(sessionKey('https://shop.ru/catalog', 'page')).toBe(expected)
    expect(sessionKey('https://shop.ru/catalog/', 'page')).toBe(expected)
  })

  it('separates pages of one site', () => {
    expect(sessionKey('https://shop.ru/catalog', 'page')).not.toBe(
      sessionKey('https://shop.ru/cart', 'page'),
    )
  })

  it('keeps the root as a single slash', () => {
    expect(sessionKey('https://shop.ru', 'page')).toBe('https://shop.ru/')
    expect(sessionKey('https://shop.ru/?utm=1', 'page')).toBe('https://shop.ru/')
  })
})

describe('isRestrictedUrl (F1.5)', () => {
  it.each([
    'chrome://extensions',
    'chrome://extensions/shortcuts',
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/src/popup/index.html',
    'about:blank',
    'edge://settings',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com/',
    'https://chromewebstore.google.com/detail/foo/abcdef',
    'https://chrome.google.com/webstore/detail/foo',
    'https://example.com/report.pdf',
    'https://example.com/files/Report.PDF',
    'data:text/html,hello',
    'not a url',
    '',
    null,
    undefined,
  ])('%s is restricted', (url) => {
    expect(isRestrictedUrl(url)).toBe(true)
  })

  it.each([
    'https://shop.example.ru/catalog',
    'http://localhost:5173/',
    'https://chrome.google.com/',
    'https://example.com/pdf-viewer',
    'file:///Users/me/index.html',
  ])('%s is allowed', (url) => {
    expect(isRestrictedUrl(url)).toBe(false)
  })
})
