import { describe, expect, it } from 'vitest'
import { bearingDeg, FpsMeter, padCount } from '../src/hud/telemetry'

describe('bearingDeg', () => {
  it('formats radians as zero-padded degrees', () => {
    expect(bearingDeg(0)).toBe('000')
    expect(bearingDeg(Math.PI)).toBe('180')
  })

  it('wraps negative angles into [0, 360)', () => {
    expect(bearingDeg(-Math.PI / 2)).toBe('270')
  })

  it('wraps angles beyond a full turn', () => {
    expect(bearingDeg(Math.PI * 2.5)).toBe('090')
  })
})

describe('FpsMeter', () => {
  it('converges to the frame rate it is fed', () => {
    const meter = new FpsMeter()
    for (let i = 0; i < 300; i++) meter.update(1 / 30)
    expect(meter.read()).toBeGreaterThanOrEqual(29)
    expect(meter.read()).toBeLessThanOrEqual(31)
  })

  it('ignores zero deltas', () => {
    const meter = new FpsMeter()
    for (let i = 0; i < 300; i++) meter.update(1 / 60)
    meter.update(0)
    expect(meter.read()).toBeGreaterThanOrEqual(59)
  })
})

describe('padCount', () => {
  it('pads to the requested width', () => {
    expect(padCount(3, 2)).toBe('03')
    expect(padCount(60000, 5)).toBe('60000')
  })
})
