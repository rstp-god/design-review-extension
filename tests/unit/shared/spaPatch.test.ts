// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { isHistoryPatched, LOCATION_CHANGE_EVENT, patchHistoryInPage } from '@/shared/spaPatch'

describe('patchHistoryInPage', () => {
  it('is self-contained and dispatches the event the overlay listens to', () => {
    const source = patchHistoryInPage.toString()
    expect(source).toContain(LOCATION_CHANGE_EVENT)
    // No references to module-level bindings: the function is serialized into the page.
    expect(source).not.toMatch(/\bLOCATION_CHANGE_EVENT\b/)
    expect(source).not.toMatch(/\bPATCHED_FLAG\b/)
  })

  it('notifies on pushState and replaceState, once per call, and patches only once', () => {
    const listener = vi.fn()
    window.addEventListener(LOCATION_CHANGE_EVENT, listener)
    const pushState = history.pushState

    patchHistoryInPage()
    patchHistoryInPage()
    expect(isHistoryPatched()).toBe(true)

    history.pushState({}, '', '/catalog')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(location.pathname).toBe('/catalog')

    history.replaceState({}, '', '/cart')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(location.pathname).toBe('/cart')

    history.pushState = pushState
    window.removeEventListener(LOCATION_CHANGE_EVENT, listener)
  })
})
