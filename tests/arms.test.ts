import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { makeGauss } from '../src/galaxy/math'
import { mulberry } from './rng'

describe('arm model', () => {
  it('is deterministic for a seeded rng', () => {
    const a = createArmModel(ARM_DEFAULTS, mulberry(7))
    const b = createArmModel(ARM_DEFAULTS, mulberry(7))
    expect(a.spurs).toEqual(b.spurs)
    expect(a.spurs).toHaveLength(ARM_DEFAULTS.arms * ARM_DEFAULTS.spurs)
  })

  it('advances the ridge by spin per unit radius, arms evenly spaced', () => {
    const m = createArmModel({ ...ARM_DEFAULTS, wobble: 0 }, mulberry(1))
    expect(m.ridgeAngle(0, 2) - m.ridgeAngle(0, 1)).toBeCloseTo(ARM_DEFAULTS.spin, 6)
    expect(m.ridgeAngle(1, 1) - m.ridgeAngle(0, 1)).toBeCloseTo(Math.PI, 6)
  })

  it('scatters samples around the ridge within the spread bound', () => {
    const m = createArmModel({ ...ARM_DEFAULTS, spurs: 0 }, mulberry(2))
    const rand = mulberry(3)
    const gauss = makeGauss(rand)
    const r = 2
    const t = r / 4.5
    const bound = 3 * 0.5 * (ARM_DEFAULTS.spread + t * ARM_DEFAULTS.spreadGrowth)
    let sumAbs = 0
    for (let i = 0; i < 2000; i++) {
      const d = m.sample(0, r, t, rand, gauss) - m.ridgeAngle(0, r)
      expect(Math.abs(d)).toBeLessThanOrEqual(bound * 1.01)
      sumAbs += Math.abs(d)
    }
    expect(sumAbs / 2000).toBeLessThan(bound / 2)
  })

  it('spur samples diverge from the ridge only inside the spur window', () => {
    const p = { ...ARM_DEFAULTS, spurs: 1, spread: 0, spreadGrowth: 0 }
    const m = createArmModel(p, mulberry(4))
    const rand = mulberry(5)
    const gauss = makeGauss(rand)
    const spur = m.spurs[0]
    const before = spur.root - 0.05
    for (let i = 0; i < 50; i++) {
      expect(m.sample(spur.arm, before * 4.5, before, rand, gauss)).toBeCloseTo(
        m.ridgeAngle(spur.arm, before * 4.5),
        6,
      )
    }
    const inside = spur.root + p.spurLength / 2
    let diverged = 0
    for (let i = 0; i < 50; i++) {
      const d = m.sample(spur.arm, inside * 4.5, inside, rand, gauss) - m.ridgeAngle(spur.arm, inside * 4.5)
      if (Math.abs(d) > 1e-6) {
        diverged++
        expect(Math.sign(d)).toBe(spur.sign)
      }
    }
    expect(diverged).toBeGreaterThan(0)
  })

  it('lane angle sits a world-unit offset off the ridge toward the concave side', () => {
    const m = createArmModel(ARM_DEFAULTS, mulberry(6))
    expect(m.laneAngle(0, 2, 0.2)).toBeCloseTo(m.ridgeAngle(0, 2) - 0.1, 6)
  })
})
