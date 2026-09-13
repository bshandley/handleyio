import { describe, expect, it } from 'vitest'
import { createArmModel } from '../src/galaxy/arms'
import { createGlow, generateGlow, GLOW_DEFAULTS } from '../src/galaxy/glow'
import { RENDER_ORDER } from '../src/galaxy/order'
import { eccentricityAt } from '../src/galaxy/orbit'
import { mulberry } from './rng'

describe('generateGlow', () => {
  const model = createArmModel()
  const g = generateGlow({ ...GLOW_DEFAULTS, count: 1000 }, model, mulberry(9))

  it('sizes buffers to count', () => {
    expect(g.radius).toHaveLength(1000)
    expect(g.color).toHaveLength(3000)
  })

  it('stays inside the soft edge with sizes in range and alpha in (0, 1]', () => {
    let maxRadius = 0
    for (let i = 0; i < 1000; i++) {
      expect(g.radius[i]).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(g.radius[i])).toBe(true)
      if (g.radius[i] > maxRadius) maxRadius = g.radius[i]
      expect(g.size[i]).toBeGreaterThanOrEqual(GLOW_DEFAULTS.sizeMin)
      expect(g.size[i]).toBeLessThanOrEqual(GLOW_DEFAULTS.sizeMax * 1.5)
      expect(g.alpha[i]).toBeGreaterThan(0)
      expect(g.alpha[i]).toBeLessThanOrEqual(GLOW_DEFAULTS.alpha * 1.3 + 1e-6)
    }
    expect(maxRadius).toBeGreaterThan(0.9 * GLOW_DEFAULTS.radius)
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

  it('disc haze follows the eccentricity law; bulge haze is circular', () => {
    let circular = 0
    for (let i = 0; i < 1000; i++) {
      if (g.ecc[i] === 0) circular++
      else expect(g.ecc[i]).toBeCloseTo(eccentricityAt(g.radius[i]), 6)
    }
    expect(circular / 1000).toBeGreaterThan(GLOW_DEFAULTS.bulgeFraction * 0.7)
  })

  it('bulge haze has a compact core component', () => {
    const core = GLOW_DEFAULTS.bulgeRadius * GLOW_DEFAULTS.bulgeCoreSigma * 2
    let inCore = 0
    for (let i = 0; i < 1000; i++) if (g.ecc[i] === 0 && g.radius[i] < core) inCore++
    expect(inCore / 1000).toBeGreaterThan(GLOW_DEFAULTS.bulgeFraction * GLOW_DEFAULTS.bulgeCoreShare * 0.6)
  })
})

describe('createGlow', () => {
  it('builds an additive mesh in the glow render slot', () => {
    const model = createArmModel()
    const layer = createGlow(model, 800, 600, { count: 200 }, mulberry(3))
    expect(layer.mesh.renderOrder).toBe(RENDER_ORDER.glow)
    expect(layer.mesh.frustumCulled).toBe(false)
    layer.setFraction(0.5)
    expect(layer.mesh.geometry.instanceCount).toBe(100)
    layer.setViewport(400, 300)
    layer.setTime(12)
    layer.setProximity(6)
    expect(layer.mesh.material.uniforms.uProximity.value).toBe(6)
    expect(layer.mesh.material.uniforms.uGlowArm.value).toBeGreaterThan(0)
    layer.dispose()
  })
})
