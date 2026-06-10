import { describe, expect, it } from 'vitest'
import { FpsGovernor, pickInitialCount, TIERS } from '../src/quality'

describe('pickInitialCount', () => {
  it('gives desktops the top tier', () => {
    expect(pickInitialCount(2560, 1440, 10)).toBe(TIERS[0])
  })
  it('gives small screens or few cores a lower tier', () => {
    expect(pickInitialCount(390, 844, 6)).toBeLessThan(TIERS[0])
  })
})

describe('FpsGovernor', () => {
  it('steps down after sustained low fps', () => {
    const gov = new FpsGovernor(TIERS[0])
    let stepped: number | null = null
    // 4 seconds of 15 fps frames
    for (let i = 0; i < 60; i++) {
      const next = gov.update(1 / 15)
      if (next !== null) stepped = next
    }
    expect(stepped).toBe(TIERS[1])
  })

  it('does not step down on good fps', () => {
    const gov = new FpsGovernor(TIERS[0])
    for (let i = 0; i < 600; i++) {
      expect(gov.update(1 / 60)).toBeNull()
    }
  })

  it('stops at the lowest tier', () => {
    const gov = new FpsGovernor(TIERS[TIERS.length - 1])
    for (let i = 0; i < 600; i++) {
      expect(gov.update(1 / 10)).toBeNull()
    }
  })
})
