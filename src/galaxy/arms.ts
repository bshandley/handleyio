// The spiral arm model shared by every galaxy layer (resolved stars, glow,
// dust). Layers sample the same ridges and spurs, so they wind together
// under the differential rotation in shaders.ts. Scale-free: spur windows
// are in t = r / radius; ridge angles use world-unit radius like before.

export interface ArmParams {
  arms: number
  /** Ridge angle advance per world unit of radius (radians). */
  spin: number
  /** Sinusoidal ridge perturbation amplitude (radians). */
  wobble: number
  /** Gaussian angular scatter about the ridge at t = 0 (radians). */
  spread: number
  /** Additional scatter at t = 1 (radians). */
  spreadGrowth: number
  /** Spurs per arm. */
  spurs: number
  /** Radial extent of a spur, in t units. */
  spurLength: number
  /** Angular divergence per t unit along a spur (radians). */
  spurSlope: number
}

export const ARM_DEFAULTS: ArmParams = {
  arms: 2,
  spin: 0.95,
  wobble: 0.1,
  spread: 0.14,
  spreadGrowth: 0.45,
  spurs: 3,
  spurLength: 0.3,
  spurSlope: 0.9,
}

export interface Spur {
  arm: number
  /** Root radius in t units. */
  root: number
  sign: 1 | -1
}

export interface ArmModel {
  params: ArmParams
  spurs: Spur[]
  ridgeAngle(arm: number, r: number): number
  /** Angle of a star scattered about the ridge of `arm` at radius r (t = r / radius). */
  sample(arm: number, r: number, t: number, rand: () => number, gauss: () => number): number
  /** Ridge angle shifted `offset` world units toward the concave side (dust lanes). */
  laneAngle(arm: number, r: number, offset: number): number
}

export function createArmModel(
  p: ArmParams = ARM_DEFAULTS,
  rand: () => number = Math.random,
): ArmModel {
  const spurs: Spur[] = []
  for (let arm = 0; arm < p.arms; arm++) {
    for (let s = 0; s < p.spurs; s++) {
      spurs.push({ arm, root: 0.2 + 0.6 * rand(), sign: rand() < 0.5 ? -1 : 1 })
    }
  }

  const ridgeAngle = (arm: number, r: number) =>
    (arm / p.arms) * Math.PI * 2 + r * p.spin + p.wobble * Math.sin(r * 3.1 + arm * 1.9)

  return {
    params: p,
    spurs,
    ridgeAngle,
    sample(arm, r, t, rand, gauss) {
      let a = ridgeAngle(arm, r) + gauss() * (p.spread + t * p.spreadGrowth)
      // half the samples inside a spur's radial window follow it off the ridge
      for (const s of spurs) {
        if (s.arm !== arm) continue
        const d = t - s.root
        if (d > 0 && d < p.spurLength && rand() < 0.5) {
          a += s.sign * p.spurSlope * d
          break
        }
      }
      return a
    },
    laneAngle(arm, r, offset) {
      return ridgeAngle(arm, r) - offset / Math.max(0.3, r)
    },
  }
}
