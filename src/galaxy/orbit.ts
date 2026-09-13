import type { Vector3 } from 'three'

// Density-wave orbit model. Every galaxy instance moves on an ellipse whose
// tilt advances with its semi-major axis, so ellipses crowd along a two-armed
// spiral that turns rigidly at the pattern speed while stars stream through
// it. The GLSL orbitChunk in shaders.ts inlines the same math and constants;
// keep them identical (tests/orbit.test.ts transcribes the chunk).

export interface OrbitParams {
  /** Tilt advance per world unit of semi-major axis (radians). */
  spin: number
  /** Sinusoidal tilt perturbation amplitude (radians). */
  wobble: number
  /** Pattern angular speed (radians per second). */
  pattern: number
  /** Eccentricity at the centre. */
  eInner: number
  /** Fraction of eInner lost by t = a / radius = 1. */
  eFalloff: number
  /** Nominal disc radius the eccentricity law is scaled to. */
  radius: number
}

export const ORBIT: OrbitParams = {
  spin: 1.7,
  wobble: 0.1,
  pattern: 0.02,
  eInner: 0.55,
  eFalloff: 0.5,
  radius: 4.5,
}

export interface Elements {
  /** Semi-major axis (world units). */
  a: number
  /** Orbital phase at t = 0 (radians). */
  phase: number
  y: number
  ecc: number
}

/** Angular speed on the round-one rotation curve. */
export function omega(a: number): number {
  return 0.0875 / (0.3 + a)
}

export function tilt(a: number, t: number, p: OrbitParams = ORBIT): number {
  return p.spin * a + p.wobble * Math.sin(a * 3.1) + p.pattern * t
}

export function eccentricityAt(a: number, p: OrbitParams = ORBIT): number {
  const t = Math.min(1, a / p.radius)
  return p.eInner * (1 - p.eFalloff * t)
}

/** World position at time t; writes `out` and returns it (no allocation). */
export function orbitPosition(
  e: Elements,
  t: number,
  out: Vector3,
  p: OrbitParams = ORBIT,
  tiltOffset = 0,
): Vector3 {
  const phi = e.phase + omega(e.a) * t
  const th = tilt(e.a, t, p) + tiltOffset
  const lx = e.a * Math.cos(phi)
  const lz = e.a * (1 - e.ecc) * Math.sin(phi)
  const c = Math.cos(th)
  const s = Math.sin(th)
  return out.set(c * lx - s * lz, e.y, s * lx + c * lz)
}

interface FixedPointStep {
  aNew: number
  lx: number
  lz: number
  ecc: number
}

/**
 * One fixed-point step for solveElements: rotate (x, z) into the ellipse's
 * local frame by the tilt at the current a, then read back the semi-major
 * axis implied by that local position under the eccentricity law.
 */
function orbitFixedPointStep(x: number, z: number, t: number, p: OrbitParams, a: number): FixedPointStep {
  const th = tilt(a, t, p)
  const c = Math.cos(th)
  const s = Math.sin(th)
  const lx = c * x + s * z
  const lz = -s * x + c * z
  const ecc = eccentricityAt(a, p)
  return { aNew: Math.hypot(lx, lz / (1 - ecc)), lx, lz, ecc }
}

/**
 * Inverse: elements whose orbit passes through (x, y, z) at time t, with the
 * eccentricity law applied. Plain fixed-point iteration on a converges (the
 * tilt varies slowly with a), but for some inputs only linearly, with a
 * sign-alternating error that needs far more than a dozen steps to reach
 * float precision. Steffensen/Aitken acceleration turns each pair of plain
 * steps into a quadratically converging jump, so 8 cycles (16 fixed-point
 * evaluations, the same budget as the original plain loop) reach well under
 * 1e-9. The jump is guarded: if the pair is nearly degenerate or the
 * extrapolation would overshoot, fall back to the plain next iterate, which
 * always converges even if slowly.
 */
export function solveElements(
  x: number,
  y: number,
  z: number,
  t: number,
  p: OrbitParams = ORBIT,
): Elements {
  let a = Math.hypot(x, z)
  for (let i = 0; i < 8; i++) {
    const s0 = orbitFixedPointStep(x, z, t, p, a)
    const s1 = orbitFixedPointStep(x, z, t, p, s0.aNew)
    const d1 = s0.aNew - a
    const denom = s1.aNew - 2 * s0.aNew + a
    let next = s1.aNew
    if (Math.abs(denom) > 1e-9 * Math.max(1, Math.abs(d1))) {
      const candidate = a - (d1 * d1) / denom
      if (Number.isFinite(candidate) && candidate > 0 && Math.abs(candidate - s1.aNew) < 4 * Math.abs(d1)) {
        next = candidate
      }
    }
    a = next
  }
  const final = orbitFixedPointStep(x, z, t, p, a)
  const ecc = final.ecc
  const phase = Math.atan2(final.lz / (1 - ecc), final.lx) - omega(a) * t
  return { a, phase, y, ecc }
}
