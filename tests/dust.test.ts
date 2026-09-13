import { describe, expect, it } from 'vitest'
import { createArmModel } from '../src/galaxy/arms'
import {
  ATLAS_CELLS,
  buildDustAtlas,
  createDust,
  DUST_DEFAULTS,
  dustFade,
  ELONGATED_FROM,
  FADE_FULL,
  FADE_START,
  generateDust,
} from '../src/galaxy/dust'
import { eccentricityAt } from '../src/galaxy/orbit'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateDust', () => {
  const model = createArmModel()
  const d = generateDust({ ...DUST_DEFAULTS, count: 2000 }, model, mulberry(11))

  it('keeps the bulge dust-free and stays inside the disc', () => {
    for (const r of d.radius) {
      expect(r).toBeGreaterThanOrEqual(DUST_DEFAULTS.bulgeRadius * 1.5)
      expect(r).toBeLessThanOrEqual(DUST_DEFAULTS.radius * 1.05)
    }
  })

  it('uses all eight atlas cells, clumps only the round ones', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const s = d.shape[i]
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(ATLAS_CELLS)
      seen.add(s)
      if (d.size[i] <= DUST_DEFAULTS.clumpSizeMax && d.tilt[i] === 0 && d.alpha[i] >= 0.9) {
        expect(s).toBeLessThan(ELONGATED_FROM)
      }
    }
    expect(seen.size).toBe(ATLAS_CELLS)
  })

  it('lane instances carry the concave-side tilt and the eccentricity law', () => {
    let lanes = 0
    for (let i = 0; i < 2000; i++) {
      expect(d.ecc[i]).toBeCloseTo(eccentricityAt(d.radius[i]), 6)
      // buffers are Float32Array: compare with a tolerance, never ===
      if (Math.abs(d.tilt[i] + DUST_DEFAULTS.laneTilt) < 1e-6) lanes++
      else expect(d.tilt[i]).toBe(0)
    }
    expect(lanes / 2000).toBeGreaterThan(DUST_DEFAULTS.laneFraction * 0.8)
  })

  it('has a dark clump population: small, dense, on the ridge', () => {
    let clumps = 0
    for (let i = 0; i < 2000; i++) {
      if (d.size[i] <= DUST_DEFAULTS.clumpSizeMax) {
        clumps++
        expect(d.size[i]).toBeGreaterThanOrEqual(DUST_DEFAULTS.clumpSizeMin)
        expect(d.alpha[i]).toBeGreaterThanOrEqual(0.9)
        expect(d.tilt[i]).toBe(0)
      }
    }
    expect(clumps / 2000).toBeGreaterThan(DUST_DEFAULTS.clumpFraction * 0.7)
    expect(clumps / 2000).toBeLessThan(DUST_DEFAULTS.clumpFraction * 1.3)
  })

  it('cloud opacity is skewed thin with a floor', () => {
    let thin = 0
    let total = 0
    for (let i = 0; i < 2000; i++) {
      if (d.size[i] <= DUST_DEFAULTS.clumpSizeMax) continue
      total++
      expect(d.alpha[i]).toBeGreaterThanOrEqual(DUST_DEFAULTS.alphaFloor - 1e-9)
      expect(d.alpha[i]).toBeLessThanOrEqual(1)
      // skewed toward the floor: most clouds sit below the midpoint of the range
      if (d.alpha[i] < DUST_DEFAULTS.alphaFloor + (1 - DUST_DEFAULTS.alphaFloor) / 2) thin++
    }
    expect(thin / total).toBeGreaterThan(0.5)
  })

  it('is thin in y with small rotation jitter', () => {
    for (let i = 0; i < 2000; i++) {
      expect(Math.abs(d.y[i])).toBeLessThan(DUST_DEFAULTS.thickness * 1.5)
      expect(Math.abs(d.rotation[i])).toBeLessThanOrEqual(DUST_DEFAULTS.rotationJitter + 1e-6)
    }
  })
})

describe('createDust', () => {
  it('builds a mesh in the dust render slot; atlas is null without a document', () => {
    expect(buildDustAtlas()).toBeNull()
    const model = createArmModel()
    const layer = createDust(model, 800, 600, { count: 100 }, mulberry(2))
    expect(layer.mesh.renderOrder).toBe(RENDER_ORDER.dust)
    layer.setFraction(0.25)
    expect(layer.mesh.geometry.instanceCount).toBe(25)
    layer.setFade(0.5)
    expect(layer.mesh.material.uniforms.uFade.value).toBe(0.5)
    expect(layer.mesh.material.uniforms.uAlign.value).toBe(1)
    expect(layer.mesh.material.uniforms.uDustArm.value).toBeGreaterThan(0)
    layer.dispose()
  })
})

describe('dustFade', () => {
  it('is 0 at sinElevation 0 and at FADE_START (both signs)', () => {
    expect(dustFade(0)).toBe(0)
    expect(dustFade(FADE_START)).toBe(0)
    expect(dustFade(-FADE_START)).toBe(0)
  })

  it('is 1 at FADE_FULL and beyond (both signs)', () => {
    expect(dustFade(FADE_FULL)).toBe(1)
    expect(dustFade(-FADE_FULL)).toBe(1)
    expect(dustFade(1)).toBe(1)
    expect(dustFade(-1)).toBe(1)
  })

  it('is strictly between 0 and 1 at the midpoint, and monotonic across five samples', () => {
    const mid = (FADE_START + FADE_FULL) / 2
    const midValue = dustFade(mid)
    expect(midValue).toBeGreaterThan(0)
    expect(midValue).toBeLessThan(1)

    const samples = [0, 1, 2, 3, 4].map((i) =>
      dustFade(FADE_START + ((FADE_FULL - FADE_START) * i) / 4),
    )
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1])
    }
  })
})
