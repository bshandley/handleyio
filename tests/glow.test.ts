import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { createGlow, generateGlow, GLOW_DEFAULTS } from '../src/galaxy/glow'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateGlow', () => {
  const model = createArmModel(ARM_DEFAULTS, mulberry(1))
  const g = generateGlow({ ...GLOW_DEFAULTS, count: 1000 }, model, mulberry(9))

  it('sizes buffers to count', () => {
    expect(g.radius).toHaveLength(1000)
    expect(g.color).toHaveLength(3000)
  })

  it('stays inside the soft edge with sizes in range and alpha in (0, 1]', () => {
    for (let i = 0; i < 1000; i++) {
      expect(g.radius[i]).toBeLessThanOrEqual(GLOW_DEFAULTS.radius * 1.2)
      expect(g.size[i]).toBeGreaterThanOrEqual(GLOW_DEFAULTS.sizeMin)
      expect(g.size[i]).toBeLessThanOrEqual(GLOW_DEFAULTS.sizeMax * 1.5)
      expect(g.alpha[i]).toBeGreaterThan(0)
      expect(g.alpha[i]).toBeLessThanOrEqual(1)
    }
    for (const c of g.color) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('places a bulge population near the center', () => {
    let inner = 0
    for (const r of g.radius) if (r < GLOW_DEFAULTS.bulgeRadius * 2) inner++
    expect(inner / 1000).toBeGreaterThan(GLOW_DEFAULTS.bulgeFraction * 0.6)
  })
})

describe('createGlow', () => {
  it('builds an additive mesh in the glow render slot', () => {
    const model = createArmModel(ARM_DEFAULTS, mulberry(1))
    const layer = createGlow(model, 800, 600, { count: 200 }, mulberry(3))
    expect(layer.mesh.renderOrder).toBe(RENDER_ORDER.glow)
    expect(layer.mesh.frustumCulled).toBe(false)
    layer.setFraction(0.5)
    expect(layer.mesh.geometry.instanceCount).toBe(100)
    layer.setViewport(400, 300)
    layer.setTime(12)
    layer.dispose()
  })
})
