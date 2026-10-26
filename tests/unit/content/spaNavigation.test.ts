// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchLocation } from '@/content/spaNavigation'
import { LOCATION_CHANGE_EVENT, patchHistoryInPage } from '@/shared/spaPatch'

describe('watchLocation', () => {
  let unwatch: (() => void) | undefined

  afterEach(() => {
    unwatch?.()
    history.replaceState({}, '', '/')
  })

  it('reports pathname changes from the patched history and from popstate', () => {
    const onChange = vi.fn()
    patchHistoryInPage()
    unwatch = watchLocation(onChange)

    history.pushState({}, '', '/catalog/')
    expect(onChange).toHaveBeenCalledWith({
      pathname: '/catalog',
      url: 'http://localhost:3000/catalog/',
    })

    history.replaceState({}, '', '/catalog?page=2#top')
    expect(onChange).toHaveBeenCalledTimes(1)

    history.replaceState({}, '', '/cart')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({
      pathname: '/cart',
      url: 'http://localhost:3000/cart',
    })
  })

  it('stops reporting after unwatch', () => {
    const onChange = vi.fn()
    watchLocation(onChange)()
    history.replaceState({}, '', '/elsewhere')
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT))
    expect(onChange).not.toHaveBeenCalled()
  })
})
