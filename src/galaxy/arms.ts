import { ORBIT, tilt } from './orbit'

// The arm ridge is the line of apsides of the density-wave ellipses
// (orbit.ts): arm k at semi-major axis a lies along tilt(a) + k * PI. This
// is the CPU description of where the GPU crowds the light; generators use
// it to seed clusters on the arms.

export interface ArmParams {
  arms: number
  /** Ridge angle advance per world unit of a (radians). Mirrors ORBIT.spin. */
  spin: number
  /** Sinusoidal ridge perturbation amplitude (radians). Mirrors ORBIT.wobble. */
  wobble: number
}

export const ARM_DEFAULTS: ArmParams = {
  arms: 2,
  spin: ORBIT.spin,
  wobble: ORBIT.wobble,
}

export interface ArmModel {
  params: ArmParams
  /** Ridge angle of `arm` at semi-major axis a, at t = 0. */
  ridgeAngle(arm: number, a: number): number
}

export function createArmModel(p: ArmParams = ARM_DEFAULTS): ArmModel {
  const orbit = { ...ORBIT, spin: p.spin, wobble: p.wobble }
  return {
    params: p,
    ridgeAngle: (arm, a) => tilt(a, 0, orbit) + (arm / p.arms) * Math.PI * 2,
  }
}
