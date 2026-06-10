import { describe, expect, it } from 'vitest'
import { generateGalaxy, GALAXY_DEFAULTS } from '../src/galaxy/generate'

describe('generateGalaxy', () => {
  const g = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, mulberry(42))

  it('produces buffers sized to count', () => {
    expect(g.radius).toHaveLength(5000)
    expect(g.angle).toHaveLength(5000)
    expect(g.y).toHaveLength(5000)
    expect(g.size).toHaveLength(5000)
    expect(g.color).toHaveLength(15000)
  })

  it('keeps radii within bounds', () => {
    for (const r of g.radius) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(GALAXY_DEFAULTS.radius)
    }
  })

  it('keeps colors in [0, 1]', () => {
    for (const c of g.color) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for a seeded rng', () => {
    const h = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, mulberry(42))
    expect(h.radius[123]).toBe(g.radius[123])
  })
})

function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
