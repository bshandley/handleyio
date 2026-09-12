import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  eccentricityAt,
  omega,
  ORBIT,
  orbitPosition,
  solveElements,
  tilt,
} from '../src/galaxy/orbit'
import { orbitChunk } from '../src/galaxy/shaders'

describe('orbit model', () => {
  it('keeps the round-one rotation curve', () => {
    expect(omega(0)).toBeCloseTo(0.0875 / 0.3, 9)
    expect(omega(2)).toBeCloseTo(0.0875 / 2.3, 9)
  })

  it('tilt advances by spin per unit a and by pattern per second', () => {
    const p = { ...ORBIT, wobble: 0 }
    expect(tilt(2, 0, p) - tilt(1, 0, p)).toBeCloseTo(p.spin, 9)
    expect(tilt(1, 10, p) - tilt(1, 0, p)).toBeCloseTo(p.pattern * 10, 9)
  })

  it('eccentricity falls from eInner at the centre to eInner (1 - eFalloff) at the edge', () => {
    expect(eccentricityAt(0)).toBeCloseTo(ORBIT.eInner, 9)
    expect(eccentricityAt(ORBIT.radius)).toBeCloseTo(ORBIT.eInner * (1 - ORBIT.eFalloff), 9)
    expect(eccentricityAt(ORBIT.radius * 3)).toBeCloseTo(ORBIT.eInner * (1 - ORBIT.eFalloff), 9)
  })

  it('a circular orbit with no tilt is the round-one circle', () => {
    const p = { ...ORBIT, spin: 0, wobble: 0, pattern: 0 }
    const out = new Vector3()
    orbitPosition({ a: 2, phase: 0.3, y: 0.1, ecc: 0 }, 7, out, p)
    const angle = 0.3 + omega(2) * 7
    expect(out.x).toBeCloseTo(2 * Math.cos(angle), 9)
    expect(out.z).toBeCloseTo(2 * Math.sin(angle), 9)
    expect(out.y).toBeCloseTo(0.1, 9)
  })

  it('an eccentric orbit stays between a (1 - e) and a from the centre', () => {
    const out = new Vector3()
    for (let t = 0; t < 600; t += 7) {
      orbitPosition({ a: 3, phase: 1.1, y: 0, ecc: 0.3 }, t, out)
      const r = Math.hypot(out.x, out.z)
      expect(r).toBeGreaterThanOrEqual(3 * 0.7 - 1e-9)
      expect(r).toBeLessThanOrEqual(3 + 1e-9)
    }
  })

  it('a tilt offset rotates the whole ellipse', () => {
    const a = new Vector3()
    const b = new Vector3()
    orbitPosition({ a: 2.5, phase: 0.4, y: 0, ecc: 0.2 }, 3, a, ORBIT, 0)
    orbitPosition({ a: 2.5, phase: 0.4, y: 0, ecc: 0.2 }, 3, b, ORBIT, 0.5)
    const ra = Math.atan2(a.z, a.x)
    const rb = Math.atan2(b.z, b.x)
    const d = Math.atan2(Math.sin(rb - ra), Math.cos(rb - ra))
    expect(d).toBeCloseTo(0.5, 9)
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(Math.hypot(a.x, a.z), 9)
  })

  it('solveElements round-trips registry-style positions at t = 0', () => {
    const out = new Vector3()
    for (const [x, y, z] of [
      [2.8, 0.25, 0.6],
      [-1.9, -0.15, 2.4],
      [-0.8, 0.3, -3.0],
      [1.8, -0.2, -1.9],
      [-3.2, 0.15, -0.8],
    ]) {
      const e = solveElements(x, y, z, 0)
      expect(e.ecc).toBeCloseTo(eccentricityAt(e.a), 9)
      orbitPosition(e, 0, out)
      expect(out.x).toBeCloseTo(x, 4)
      expect(out.y).toBeCloseTo(y, 9)
      expect(out.z).toBeCloseTo(z, 4)
    }
  })

  it('solveElements round-trips at a later time too', () => {
    const out = new Vector3()
    const e = solveElements(1.5, 0, -2.0, 42)
    orbitPosition(e, 42, out)
    expect(out.x).toBeCloseTo(1.5, 4)
    expect(out.z).toBeCloseTo(-2.0, 4)
  })
})

describe('GLSL orbit chunk', () => {
  // Hand transcription of orbitChunk. If this drifts from the GLSL, the
  // beacons (CPU) and the stars (GPU) part ways on screen.
  function glsl(a: number, phase0: number, y: number, ecc: number, tiltOffset: number, uTime: number) {
    const uSpin = ORBIT.spin
    const uWobble = ORBIT.wobble
    const uPattern = ORBIT.pattern
    const uOrbit = 1
    const orbitOmega = (a: number) => 0.0875 / (0.3 + a)
    const orbitTilt = (a: number, offset: number) =>
      uSpin * a + uWobble * Math.sin(a * 3.1) + uPattern * uTime + offset
    const phi = phase0 + orbitOmega(a) * uTime * uOrbit
    const th = orbitTilt(a, tiltOffset)
    const lx = a * Math.cos(phi)
    const lz = a * (1.0 - ecc) * Math.sin(phi)
    const c = Math.cos(th)
    const s = Math.sin(th)
    return [c * lx - s * lz, y, s * lx + c * lz]
  }

  it('matches orbitPosition for a handful of elements', () => {
    const out = new Vector3()
    for (const [a, phase, y, ecc, off, t] of [
      [1, 0, 0, 0, 0, 0],
      [2.5, 1.2, 0.1, 0.3, 0, 33],
      [4, -2, -0.2, 0.15, -0.25, 210],
      [0.4, 3, 0.05, 0, 0, 900],
    ]) {
      orbitPosition({ a, phase, y, ecc }, t, out, ORBIT, off)
      const [x, yy, z] = glsl(a, phase, y, ecc, off, t)
      expect(out.x).toBeCloseTo(x, 9)
      expect(out.y).toBeCloseTo(yy, 9)
      expect(out.z).toBeCloseTo(z, 9)
    }
  })

  it('inlines the same curve constants as orbit.ts', () => {
    expect(orbitChunk).toContain('0.0875 / (0.3 + a)')
    expect(orbitChunk).toContain('sin(a * 3.1)')
  })
})
