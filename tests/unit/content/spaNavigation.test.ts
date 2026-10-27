// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOCATION_POLL_INTERVAL_MS,
  locationWatchStrategy,
  watchLocation,
} from '@/content/spaNavigation'

/** A window with the Navigation API: `go` changes the location and fires `currententrychange`. */
function fakeNavigationWindow(pathname = '/') {
  const navigation = new EventTarget()
  const location = { pathname, href: `http://localhost:3000${pathname}` }
  const win = {
    location,
    navigation,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
  }
  const go = (next: string) => {
    location.pathname = next.split(/[?#]/)[0] ?? '/'
    location.href = `http://localhost:3000${next}`
    navigation.dispatchEvent(new Event('currententrychange'))
  }
  return { win: win as unknown as Window, raw: win, go }
}

describe('watchLocation', () => {
  let unwatch: (() => void) | undefined

  afterEach(() => {
    unwatch?.()
    unwatch = undefined
    vi.useRealTimers()
    history.replaceState({}, '', '/')
  })

  it('uses the Navigation API when the window has it, without polling or history patches', () => {
    const { win, raw, go } = fakeNavigationWindow('/')
    const onChange = vi.fn()
    unwatch = watchLocation(onChange, win)

    go('/catalog/')
    expect(onChange).toHaveBeenCalledWith({
      pathname: '/catalog',
      url: 'http://localhost:3000/catalog/',
    })

    go('/catalog?page=2#top')
    expect(onChange).toHaveBeenCalledTimes(1)

    go('/cart')
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({
      pathname: '/cart',
      url: 'http://localhost:3000/cart',
    })

    expect(raw.addEventListener).not.toHaveBeenCalled()
    expect(raw.setInterval).not.toHaveBeenCalled()

    unwatch()
    unwatch = undefined
    go('/elsewhere')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('falls back to popstate plus polling when there is no Navigation API', () => {
    vi.useFakeTimers()
    expect(locationWatchStrategy(window)).toBe('polling')
    const onChange = vi.fn()
    unwatch = watchLocation(onChange, window)

    // `pushState` fires no event: only the poll notices it.
    history.pushState({}, '', '/catalog/')
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(LOCATION_POLL_INTERVAL_MS)
    expect(onChange).toHaveBeenCalledWith({
      pathname: '/catalog',
      url: 'http://localhost:3000/catalog/',
    })

    // Back / Forward is reported at once.
    history.replaceState({}, '', '/cart')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({
      pathname: '/cart',
      url: 'http://localhost:3000/cart',
    })

    history.replaceState({}, '', '/cart?page=2#top')
    vi.advanceTimersByTime(LOCATION_POLL_INTERVAL_MS * 3)
    expect(onChange).toHaveBeenCalledTimes(2)

    unwatch()
    unwatch = undefined
    history.replaceState({}, '', '/elsewhere')
    window.dispatchEvent(new PopStateEvent('popstate'))
    vi.advanceTimersByTime(LOCATION_POLL_INTERVAL_MS * 3)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('reports the strategy', () => {
    expect(locationWatchStrategy(fakeNavigationWindow().win)).toBe('navigation-api')
    expect(locationWatchStrategy(window)).toBe('polling')
  })
})
