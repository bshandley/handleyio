import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { buildDustAtlas, createDust, DUST_DEFAULTS, generateDust } from '../src/galaxy/dust'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateDust', () => {
  const model = createArmModel(ARM_DEFAULTS, mulberry(1))
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

  it('puts most instances on the arm lanes', () => {
    let onLane = 0
    for (let i = 0; i < d.radius.length; i++) {
      const r = d.radius[i]
      let best = Infinity
      for (let arm = 0; arm < ARM_DEFAULTS.arms; arm++) {
        const lane = model.laneAngle(arm, r, DUST_DEFAULTS.laneOffset)
        const delta = Math.atan2(Math.sin(d.angle[i] - lane), Math.cos(d.angle[i] - lane))
        best = Math.min(best, Math.abs(delta))
      }
      if (best < 0.25) onLane++
    }
    expect(onLane / d.radius.length).toBeGreaterThan(DUST_DEFAULTS.laneFraction * 0.8)
  })

  it('is thin in y', () => {
    for (const y of d.y) expect(Math.abs(y)).toBeLessThan(DUST_DEFAULTS.thickness * 1.5)
  })
})

describe('createDust', () => {
  it('builds a mesh in the dust render slot; atlas is null without a document', () => {
    expect(buildDustAtlas()).toBeNull()
    const model = createArmModel(ARM_DEFAULTS, mulberry(1))
    const layer = createDust(model, 800, 600, { count: 100 }, mulberry(2))
    expect(layer.mesh.renderOrder).toBe(RENDER_ORDER.dust)
    layer.setFraction(0.25)
    expect(layer.mesh.geometry.instanceCount).toBe(25)
    layer.dispose()
  })
})
