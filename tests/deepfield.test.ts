import { describe, expect, it } from 'vitest'
import { createDeepField, generateDeepField, DEEP_ALPHA, DEEP_FIELD_COUNT, DEEP_SIZE } from '../src/galaxy/deepfield'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateDeepField', () => {
  const d = generateDeepField(40, mulberry(8))

  it('places smudges on the far shell, elongated, faint', () => {
    for (let i = 0; i < 40; i++) {
      const r = Math.hypot(d.radius[i], d.y[i])
      expect(r).toBeGreaterThanOrEqual(45)
      expect(r).toBeLessThanOrEqual(55)
      expect(d.shape[i]).toBeGreaterThanOrEqual(1.5)
      expect(d.shape[i]).toBeLessThanOrEqual(3.5)
      expect(d.alpha[i]).toBeGreaterThanOrEqual(DEEP_ALPHA[0] - 1e-9)
      expect(d.alpha[i]).toBeLessThanOrEqual(DEEP_ALPHA[1] + 1e-9)
      expect(d.size[i]).toBeGreaterThanOrEqual(DEEP_SIZE[0] - 1e-9)
      expect(d.size[i]).toBeLessThanOrEqual(DEEP_SIZE[1] + 1e-9)
    }
  })
})

describe('deepfield defaults', () => {
  it('ships 120 faint smudges', () => {
    expect(DEEP_FIELD_COUNT).toBe(120)
    expect(DEEP_ALPHA[1]).toBeLessThan(0.2)
  })
})

describe('createDeepField', () => {
  it('does not orbit and sits in the background slot', () => {
    const field = createDeepField(800, 600, 10, mulberry(2))
    expect(field.mesh.renderOrder).toBe(RENDER_ORDER.background)
    expect(field.mesh.material.uniforms.uOrbit.value).toBe(0)
    field.setViewport(400, 300)
    field.dispose()
  })
})
