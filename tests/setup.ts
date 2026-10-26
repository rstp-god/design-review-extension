import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { trustSyntheticEventsForTests } from '@/shared/trustedEvents'

beforeEach(() => {
  // jsdom cannot dispatch trusted events; the overlay ignores untrusted ones in production.
  trustSyntheticEventsForTests(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
