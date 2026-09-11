import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { generateGalaxy, GALAXY_DEFAULTS, PALETTE, paletteAt } from '../src/galaxy/generate'
import { mulberry } from './rng'

describe('generateGalaxy', () => {
  const model = createArmModel(ARM_DEFAULTS, mulberry(1))
  const g = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, model, mulberry(42))

  it('produces buffers sized to count', () => {
    expect(g.radius).toHaveLength(5000)
    expect(g.angle).toHaveLength(5000)
    expect(g.y).toHaveLength(5000)
    expect(g.size).toHaveLength(5000)
    expect(g.spike).toHaveLength(5000)
    expect(g.color).toHaveLength(15000)
  })

  it('keeps radii within the soft-edge bound (1.2x nominal radius)', () => {
    for (const r of g.radius) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(GALAXY_DEFAULTS.radius * 1.2)
    }
  })

  it('has a fuzzy edge: some stars past the nominal radius', () => {
    let beyond = 0
    for (const r of g.radius) if (r > GALAXY_DEFAULTS.radius) beyond++
    expect(beyond).toBeGreaterThan(0)
  })

  it('keeps colors in [0, 1]', () => {
    for (const c of g.color) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for a seeded rng', () => {
    const h = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, model, mulberry(42))
    expect(h.radius[123]).toBe(g.radius[123])
    expect(h.splitIndex).toBe(g.splitIndex)
  })

  it('is sorted by y with splitIndex at the sign change', () => {
    for (let i = 1; i < g.y.length; i++) expect(g.y[i]).toBeGreaterThanOrEqual(g.y[i - 1])
    for (let i = 0; i < g.splitIndex; i++) expect(g.y[i]).toBeLessThan(0)
    for (let i = g.splitIndex; i < g.y.length; i++) expect(g.y[i]).toBeGreaterThanOrEqual(0)
    expect(g.splitIndex).toBeGreaterThan(1000)
    expect(g.splitIndex).toBeLessThan(4000)
  })

  it('populates a bulge at the center', () => {
    let inner = 0
    for (const r of g.radius) if (r < GALAXY_DEFAULTS.bulgeRadius) inner++
    // A disc of uniform surface density would put (0.55 / 4.5)^2 = 1.5% of its
    // stars inside bulgeRadius, so anything past 3% is a real concentration.
    expect(inner / g.radius.length).toBeGreaterThan(0.03)
  })

  it('flags a small minority of stars as spiked giants', () => {
    // At 5000 stars with BRIGHT_GIANT_CUTOFF 0.995, the expected count is
    // single digits and depends on the seed; changing the seed or count may
    // need a new bound.
    let spiked = 0
    for (const s of g.spike) {
      expect(s === 0 || s === 1).toBe(true)
      if (s === 1) spiked++
    }
    expect(spiked).toBeGreaterThan(0)
    expect(spiked / g.spike.length).toBeLessThan(0.1)
  })
})

describe('paletteAt', () => {
  it('returns the stops at their positions and blends between', () => {
    expect(paletteAt(PALETTE, 0)).toEqual(PALETTE[0])
    const end = paletteAt(PALETTE, 1)
    for (let c = 0; c < 3; c++) expect(end[c]).toBeCloseTo(PALETTE[3][c], 6)
    const mid = paletteAt(PALETTE, 1 / 6)
    for (let c = 0; c < 3; c++) expect(mid[c]).toBeCloseTo((PALETTE[0][c] + PALETTE[1][c]) / 2, 6)
  })
})
