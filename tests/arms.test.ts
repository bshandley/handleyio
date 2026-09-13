import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { ORBIT, tilt } from '../src/galaxy/orbit'

describe('arm model', () => {
  it('ridge angle is the orbit tilt at t = 0 plus the arm offset', () => {
    const m = createArmModel()
    expect(m.ridgeAngle(0, 2)).toBeCloseTo(tilt(2, 0, ORBIT), 9)
    expect(m.ridgeAngle(1, 2)).toBeCloseTo(tilt(2, 0, ORBIT) + Math.PI, 9)
  })

  it('advances the ridge by spin per unit radius with wobble off', () => {
    const m = createArmModel({ ...ARM_DEFAULTS, wobble: 0 })
    expect(m.ridgeAngle(0, 3) - m.ridgeAngle(0, 2)).toBeCloseTo(ARM_DEFAULTS.spin, 9)
  })

  it('defaults share the orbit constants so the CPU ridge matches the GPU tilt', () => {
    expect(ARM_DEFAULTS.spin).toBe(ORBIT.spin)
    expect(ARM_DEFAULTS.wobble).toBe(ORBIT.wobble)
    expect(ARM_DEFAULTS.arms).toBe(2)
  })
})
