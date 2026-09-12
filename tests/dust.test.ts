import { describe, expect, it } from 'vitest'
import { createArmModel } from '../src/galaxy/arms'
import {
  buildDustAtlas,
  createDust,
  DUST_DEFAULTS,
  dustFade,
  FADE_FULL,
  FADE_START,
  generateDust,
} from '../src/galaxy/dust'
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

  it('uses the four atlas cells', () => {
    const seen = new Set<number>()
    for (const s of d.shape) {
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(4)
      seen.add(s)
    }
    expect(seen.size).toBe(4)
  })

  it('carries a per-instance tilt buffer', () => {
    expect(d.tilt).toHaveLength(2000)
  })

  it('is thin in y', () => {
    for (const y of d.y) expect(Math.abs(y)).toBeLessThan(DUST_DEFAULTS.thickness * 1.5)
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
