export interface GalaxyParams {
  count: number
  arms: number
  radius: number
  spin: number
  thickness: number
  coreColor: [number, number, number]
  midColor: [number, number, number]
  edgeColor: [number, number, number]
}

export const GALAXY_DEFAULTS: GalaxyParams = {
  count: 60_000,
  arms: 4,
  radius: 4.5,
  spin: 1.1,
  thickness: 0.35,
  coreColor: [1.0, 0.85, 0.6],
  midColor: [0.85, 0.7, 0.95],
  edgeColor: [0.45, 0.55, 1.0],
}

// Differential rotation curve. The galaxy vertex shader inlines the same
// constants (see shaders.ts); keep them in sync.
export function orbitalSpeed(radius: number): number {
  return 0.0875 / (0.3 + radius)
}

export interface GalaxyBuffers {
  radius: Float32Array
  angle: Float32Array
  y: Float32Array
  color: Float32Array
  size: Float32Array
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

// Population mix, tuned by eye against the preview
const CLUMP_FRACTION = 0.15 // star-forming clusters along the arms
const FIELD_FRACTION = 0.08 // unstructured disc/halo stars
const DUST_CHANCE = 0.08
const BRIGHT_GIANT_CUTOFF = 0.8 // of the size power law; ~5% of stars

export function generateGalaxy(
  p: GalaxyParams,
  rand: () => number = Math.random,
): GalaxyBuffers {
  const radius = new Float32Array(p.count)
  const angle = new Float32Array(p.count)
  const y = new Float32Array(p.count)
  const color = new Float32Array(p.count * 3)
  const size = new Float32Array(p.count)

  const gauss = () => rand() + rand() + rand() - 1.5 // approx normal, sd ~0.5

  // Star-forming clumps seeded along the arms
  const clusterCount = Math.max(8, Math.round(p.count / 1500))
  const clusters: Array<{ r: number; a: number; y: number }> = []
  for (let c = 0; c < clusterCount; c++) {
    const r = (0.25 + 0.75 * Math.pow(rand(), 1.5)) * p.radius
    const arm = c % p.arms
    const a = (arm / p.arms) * Math.PI * 2 + r * p.spin + gauss() * 0.18
    clusters.push({ r, a, y: gauss() * p.thickness * 0.4 })
  }

  for (let i = 0; i < p.count; i++) {
    let r: number
    let a: number
    let yy: number
    const roll = rand()
    const inClump = roll < CLUMP_FRACTION

    if (inClump) {
      const c = clusters[Math.floor(rand() * clusters.length)]
      r = c.r + gauss() * 0.18
      a = c.a + (gauss() * 0.12) / Math.max(0.4, c.r * 0.5)
      yy = c.y + gauss() * p.thickness * 0.25
    } else if (roll < CLUMP_FRACTION + FIELD_FRACTION) {
      r = Math.sqrt(rand()) * p.radius
      a = rand() * Math.PI * 2
      yy = gauss() * p.thickness * (1.6 - r / p.radius)
    } else {
      r = Math.pow(rand(), 2.0) * p.radius
      const t = r / p.radius
      const arm = i % p.arms
      const armAngle = (arm / p.arms) * Math.PI * 2
      const wobble = 0.12 * Math.sin(r * 3.1 + arm * 1.9)
      a = armAngle + r * p.spin + wobble + gauss() * (0.18 + t * 0.55)
      yy = gauss() * p.thickness * (1.0 - 0.75 * t)
    }

    // fuzzy edge: gaussian radial jitter, stronger outward, soft cap at 1.2x
    r += gauss() * 0.15 * (0.3 + r / p.radius)
    r = Math.min(1.2 * p.radius, Math.max(0, r))
    const t = Math.min(1, r / p.radius)
    radius[i] = r
    angle[i] = a
    y[i] = yy

    const [c0, c1] = t < 0.5 ? [p.coreColor, p.midColor] : [p.midColor, p.edgeColor]
    const tt = t < 0.5 ? t * 2 : (t - 0.5) * 2
    let cr = lerp(c0[0], c1[0], tt)
    let cg = lerp(c0[1], c1[1], tt)
    let cb = lerp(c0[2], c1[2], tt)

    // per-star temperature shift along a blackbody-ish warm/cool axis:
    // green moves with red (toward yellow-white) so nothing turns magenta
    const temp = (rand() - 0.5) * 0.24
    cr += temp
    cg += temp * 0.35
    cb -= temp

    // star-forming clumps skew young and blue-white
    if (inClump) {
      cb += 0.08
      cr -= 0.04
    }

    const jitter = 0.8 + rand() * 0.3
    const dust = rand() < DUST_CHANCE ? 0.3 : 1.0

    // power-law sizes: mostly small, a handful of bright giants that wash
    // evenly toward white
    const s = Math.pow(rand(), 4)
    size[i] = (0.6 + s * 4.5) * (t < 0.15 ? 1.4 : 1.0)
    const brighten = s > BRIGHT_GIANT_CUTOFF ? 1.4 : 1.0

    color[i * 3] = clamp01(cr * jitter * dust * brighten)
    color[i * 3 + 1] = clamp01(cg * jitter * dust * brighten)
    color[i * 3 + 2] = clamp01(cb * jitter * dust * brighten)
  }

  return { radius, angle, y, color, size }
}
