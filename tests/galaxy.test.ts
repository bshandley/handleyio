import { describe, expect, it } from 'vitest'
import { createArmModel } from '../src/galaxy/arms'
import { createGalaxy } from '../src/galaxy/galaxy'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('galaxy split', () => {
  const model = createArmModel()
  const galaxy = createGalaxy(model, { count: 2000 }, 1, mulberry(2))

  it('covers every star across the below and above draw ranges', () => {
    const below = galaxy.below.geometry.drawRange
    const above = galaxy.above.geometry.drawRange
    expect(below.start).toBe(0)
    expect(above.start).toBe(below.count)
    expect(below.count + above.count).toBe(2000)
    expect(below.count).toBeGreaterThan(0)
    expect(above.count).toBeGreaterThan(0)
  })

  it('shares one attribute buffer between the halves', () => {
    expect(galaxy.below.geometry.attributes.aRadius).toBe(galaxy.above.geometry.attributes.aRadius)
    expect(galaxy.group.children).toHaveLength(2)
  })

  it('orders the far half before the dust and the near half after', () => {
    galaxy.setCameraSide(true)
    expect(galaxy.below.renderOrder).toBe(RENDER_ORDER.farStars)
    expect(galaxy.above.renderOrder).toBe(RENDER_ORDER.nearStars)
    galaxy.setCameraSide(false)
    expect(galaxy.below.renderOrder).toBe(RENDER_ORDER.nearStars)
    expect(galaxy.above.renderOrder).toBe(RENDER_ORDER.farStars)
    expect(RENDER_ORDER.farStars).toBeLessThan(RENDER_ORDER.dust)
    expect(RENDER_ORDER.dust).toBeLessThan(RENDER_ORDER.nearStars)
  })

  it('rebuild keeps the split consistent', () => {
    galaxy.rebuild(1000)
    const below = galaxy.below.geometry.drawRange
    const above = galaxy.above.geometry.drawRange
    expect(below.count + above.count).toBe(1000)
    expect(galaxy.below.geometry.attributes.aRadius.count).toBe(1000)
  })

  it('consumes beacons as a groupOrder that outranks every per-object entry', () => {
    for (const [key, value] of Object.entries(RENDER_ORDER)) {
      if (key === 'beacons') continue
      expect(RENDER_ORDER.beacons).toBeGreaterThan(value)
    }
  })

  it('leaves galaxy.group at the default renderOrder so groupOrder 0 holds', () => {
    expect(galaxy.group.renderOrder).toBe(0)
  })
})
