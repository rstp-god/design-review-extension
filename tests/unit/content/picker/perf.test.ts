import { describe, expect, it } from 'vitest'
import { createSampler, percentile } from '@/content/picker/perf'

describe('percentile', () => {
  it('uses the nearest rank', () => {
    expect(percentile([], 0.95)).toBe(0)
    expect(percentile([5], 0.5)).toBe(5)
    expect(percentile([3, 1, 2], 0.5)).toBe(2)
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1)
    expect(percentile(twenty, 0.95)).toBe(19)
    expect(percentile(twenty, 0.5)).toBe(10)
    expect(percentile(twenty, 1)).toBe(20)
  })
})

describe('createSampler', () => {
  it('keeps a window of the latest samples and counts everything', () => {
    const sampler = createSampler(3)
    expect(sampler.stats()).toEqual({ count: 0, p50: 0, p95: 0, max: 0 })
    for (const ms of [10, 20, 30, 1.234, 2]) sampler.add(ms)
    expect(sampler.size).toBe(5)
    // Window holds [1.234, 2, 30].
    expect(sampler.stats()).toEqual({ count: 5, p50: 2, p95: 30, max: 30 })
    sampler.add(0.5)
    expect(sampler.stats()).toEqual({ count: 6, p50: 1.23, p95: 2, max: 2 })
  })
})
