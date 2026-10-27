/** Hover handler timings (spec 4.2: one frame per pointer move). Read by the E2E build only. */
export interface PerfStats {
  count: number
  p50: number
  p95: number
  max: number
}

export interface Sampler {
  add: (ms: number) => void
  /** Total samples added, including those that rolled out of the window. */
  readonly size: number
  stats: () => PerfStats
}

/** Nearest-rank percentile; `0` for an empty set. */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return sorted[rank] ?? 0
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Keeps the last `capacity` samples in a ring. */
export function createSampler(capacity = 300): Sampler {
  const samples: number[] = []
  let next = 0
  let total = 0

  return {
    add(ms) {
      if (samples.length < capacity) samples.push(ms)
      else samples[next] = ms
      next = (next + 1) % capacity
      total += 1
    },
    get size() {
      return total
    },
    stats() {
      return {
        count: total,
        p50: round2(percentile(samples, 0.5)),
        p95: round2(percentile(samples, 0.95)),
        max: round2(samples.length > 0 ? Math.max(...samples) : 0),
      }
    },
  }
}
