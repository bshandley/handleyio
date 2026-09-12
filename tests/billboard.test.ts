import { describe, expect, it } from 'vitest'
import {
  allocBillboards,
  billboardUniforms,
  billboardVertex,
  createBillboardGeometry,
  setInstanceFraction,
} from '../src/galaxy/billboard'

describe('billboard geometry', () => {
  const buffers = allocBillboards(10)
  const geometry = createBillboardGeometry(buffers, 5)

  it('draws one quad per instance', () => {
    expect(geometry.instanceCount).toBe(10)
    expect(geometry.index?.count).toBe(6)
    expect(geometry.attributes.position.count).toBe(4)
    expect(geometry.attributes.aRadius.count).toBe(10)
    expect(geometry.attributes.aColor.itemSize).toBe(3)
  })

  it('setInstanceFraction trims the instance count without touching buffers', () => {
    setInstanceFraction(geometry, 0.5)
    expect(geometry.instanceCount).toBe(5)
    setInstanceFraction(geometry, 0)
    expect(geometry.instanceCount).toBe(0)
    setInstanceFraction(geometry, 2)
    expect(geometry.instanceCount).toBe(10)
    expect(geometry.attributes.aRadius.count).toBe(10)
  })

  it('vertex shader orbits and caps screen size', () => {
    expect(billboardVertex).toContain('orbitPosition(')
    expect(billboardVertex).toContain('uMaxPx')
    expect(billboardVertex).toContain('uNearFade')
  })

  it('uniform set sizes the cap from the viewport height', () => {
    const u = billboardUniforms(800, 600)
    expect(u.uViewport.value.x).toBe(800)
    expect(u.uMaxPx.value).toBe(300)
    expect(u.uOrbit.value).toBe(1)
  })

  it('carries eccentricity and tilt per instance', () => {
    expect(buffers.ecc).toHaveLength(10)
    expect(buffers.tilt).toHaveLength(10)
    expect(geometry.attributes.aEcc.count).toBe(10)
    expect(geometry.attributes.aTilt.count).toBe(10)
  })

  it('vertex shader takes the ellipse arguments and can align to the orbit tangent', () => {
    expect(billboardVertex).toContain('orbitPosition(aRadius, aAngle, aY, aEcc, aTilt)')
    expect(billboardVertex).toContain('orbitTangent(')
    expect(billboardVertex).toContain('uAlign')
    expect(billboardVertex).toContain('vArm')
  })

  it('uniform set carries the orbit constants', () => {
    const u = billboardUniforms(800, 600)
    expect(u.uSpin.value).toBe(0.95)
    expect(u.uPattern.value).toBeGreaterThan(0)
    expect(u.uAlign.value).toBe(0)
  })
})
