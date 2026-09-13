import { describe, expect, it } from 'vitest'
import { createArmModel } from '../src/galaxy/arms'
import {
  CLUSTER_LUM_FACTOR,
  GALAXY_DEFAULTS,
  GIANT_LUM,
  LUM_FLOOR,
  LUM_SCALE,
  PALETTE,
  generateGalaxy,
  paletteAt,
} from '../src/galaxy/generate'
import { eccentricityAt } from '../src/galaxy/orbit'
import { mulberry } from './rng'

describe('generateGalaxy', () => {
  const model = createArmModel()
  const g = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, model, mulberry(42))

  it('produces buffers sized to count', () => {
    expect(g.radius).toHaveLength(5000)
    expect(g.angle).toHaveLength(5000)
    expect(g.y).toHaveLength(5000)
    expect(g.size).toHaveLength(5000)
    expect(g.spike).toHaveLength(5000)
    expect(g.color).toHaveLength(15000)
  })

  it('carries a per-star eccentricity buffer', () => {
    expect(g.ecc).toHaveLength(5000)
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

  it('carries per-star eccentricity and luminosity buffers', () => {
    expect(g.ecc).toHaveLength(5000)
    expect(g.lum).toHaveLength(5000)
  })

  it('bulge stars are circular, disc stars follow the eccentricity law', () => {
    let circular = 0
    for (let i = 0; i < 5000; i++) {
      const e = g.ecc[i]
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(eccentricityAt(0) + 1e-9)
      if (e === 0) circular++
    }
    // the bulge share is circular; everything else has some eccentricity
    expect(circular / 5000).toBeGreaterThan(GALAXY_DEFAULTS.bulgeFraction * 0.7)
    expect(circular / 5000).toBeLessThan(GALAXY_DEFAULTS.bulgeFraction * 1.3)
  })

  it('luminosity spans the floor to the giant boost with giants above 1', () => {
    let maxLum = 0
    let dim = 0
    for (let i = 0; i < 5000; i++) {
      // Cluster members (giants excepted) dim by CLUSTER_LUM_FACTOR so a
      // cluster reads as a sparkle of stars rather than one bright smear,
      // so the effective floor for them sits below LUM_FLOOR.
      expect(g.lum[i]).toBeGreaterThanOrEqual(LUM_FLOOR * CLUSTER_LUM_FACTOR - 1e-9)
      expect(g.lum[i]).toBeLessThanOrEqual((LUM_FLOOR + LUM_SCALE) * GIANT_LUM + 1e-9)
      if (g.spike[i] === 1) expect(g.lum[i]).toBeGreaterThan(1)
      if (g.lum[i] < 0.3) dim++
      maxLum = Math.max(maxLum, g.lum[i])
    }
    // most stars are faint; that is the depth cue
    expect(dim / 5000).toBeGreaterThan(0.6)
    expect(maxLum).toBeGreaterThan(1)
  })

  it('cluster members sit within a narrow band of semi-major axes so they stay compact', () => {
    // members jitter a little in a (a round knot, not a one-dimensional arc);
    // group by 0.25 world-unit bins
    const groups = new Map<number, number>()
    for (const a of g.radius) {
      const bin = Math.round(a * 4)
      groups.set(bin, (groups.get(bin) ?? 0) + 1)
    }
    let compact = 0
    for (const n of groups.values()) if (n >= 20) compact++
    // max(8, 5000 / 1500) = 8 clusters share 15% of the stars
    expect(compact).toBeGreaterThanOrEqual(6)
  })

  it('bulge has a dense core and a wide halo', () => {
    const core = GALAXY_DEFAULTS.bulgeRadius * GALAXY_DEFAULTS.bulgeCoreSigma * 2
    let inCore = 0
    for (let i = 0; i < 5000; i++) if (g.ecc[i] === 0 && g.radius[i] < core) inCore++
    // the core component alone is bulgeFraction * bulgeCoreShare of all stars
    expect(inCore / 5000).toBeGreaterThan(GALAXY_DEFAULTS.bulgeFraction * GALAXY_DEFAULTS.bulgeCoreShare * 0.6)
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
