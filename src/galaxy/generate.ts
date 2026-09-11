import type { ArmModel } from './arms'
import { clamp01, lerp, makeGauss } from './math'

export type Rgb = [number, number, number]
/** Radial color stops at t = 0, 1/3, 2/3, 1. */
export type Palette = [Rgb, Rgb, Rgb, Rgb]

// Stops sit well below 1 at the warm end: the bulge and inner disc pile up
// additively, and AgX washes anything that lands near its shoulder to cream.
export const PALETTE: Palette = [
  [0.85, 0.68, 0.42], // old gold bulge
  [0.88, 0.78, 0.62], // warm white inner disc
  [0.82, 0.88, 1.0], // blue-white
  [0.5, 0.62, 1.0], // blue edge
]

export interface GalaxyParams {
  count: number
  radius: number
  thickness: number
  /** In-plane sigma of the bulge ellipsoid (world units). */
  bulgeRadius: number
  /** y sigma as a fraction of bulgeRadius. */
  bulgeFlatten: number
  /** Share of count placed in the bulge. */
  bulgeFraction: number
  palette: Palette
}

export const GALAXY_DEFAULTS: GalaxyParams = {
  count: 60_000,
  radius: 4.5,
  thickness: 0.35,
  bulgeRadius: 0.55,
  bulgeFlatten: 0.6,
  bulgeFraction: 0.09,
  palette: PALETTE,
}

// Differential rotation curve. The GLSL orbitChunk in shaders.ts inlines the
// same constants; keep them in sync.
export function orbitalSpeed(radius: number): number {
  return 0.0875 / (0.3 + radius)
}

export function paletteAt(palette: Palette, t: number): Rgb {
  const x = clamp01(t) * 3
  const i = Math.min(2, Math.floor(x))
  const f = x - i
  const a = palette[i]
  const b = palette[i + 1]
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]
}

export interface GalaxyBuffers {
  radius: Float32Array
  angle: Float32Array
  y: Float32Array
  color: Float32Array
  size: Float32Array
  /** 1 for bright giants drawn with diffraction spikes, else 0. */
  spike: Float32Array
  /** Buffers are sorted by y; entries [0, splitIndex) have y < 0. */
  splitIndex: number
}

// Population mix, tuned by eye against the preview
const CLUMP_FRACTION = 0.15 // star-forming clusters along the arms
const FIELD_FRACTION = 0.08 // unstructured disc/halo stars
const BRIGHT_GIANT_CUTOFF = 0.995 // of the size power law; ~0.13% of disc stars

export function generateGalaxy(
  p: GalaxyParams,
  model: ArmModel,
  rand: () => number = Math.random,
): GalaxyBuffers {
  const n = p.count
  const radius = new Float32Array(n)
  const angle = new Float32Array(n)
  const y = new Float32Array(n)
  const color = new Float32Array(n * 3)
  const size = new Float32Array(n)
  const spike = new Float32Array(n)
  const gauss = makeGauss(rand)
  const arms = model.params.arms

  // Star-forming clumps seeded along the arm ridges
  const clusterCount = Math.max(8, Math.round(n / 1500))
  const clusters: Array<{ r: number; a: number; y: number }> = []
  for (let c = 0; c < clusterCount; c++) {
    const r = (0.25 + 0.75 * Math.pow(rand(), 1.5)) * p.radius
    clusters.push({
      r,
      a: model.ridgeAngle(c % arms, r) + gauss() * 0.12,
      y: gauss() * p.thickness * 0.4,
    })
  }

  for (let i = 0; i < n; i++) {
    const roll = rand()
    const inBulge = roll < p.bulgeFraction
    const inClump = !inBulge && roll < p.bulgeFraction + CLUMP_FRACTION
    const inField = !inBulge && !inClump && roll < p.bulgeFraction + CLUMP_FRACTION + FIELD_FRACTION
    let r: number
    let a: number
    let yy: number

    if (inBulge) {
      // old population: gaussian ellipsoid, flattened in y
      const gx = gauss() * 2 * p.bulgeRadius
      const gz = gauss() * 2 * p.bulgeRadius
      r = Math.hypot(gx, gz)
      a = Math.atan2(gz, gx)
      yy = gauss() * 2 * p.bulgeRadius * p.bulgeFlatten
    } else if (inClump) {
      const c = clusters[Math.floor(rand() * clusters.length)]
      r = c.r + gauss() * 0.18
      a = c.a + (gauss() * 0.12) / Math.max(0.4, c.r * 0.5)
      yy = c.y + gauss() * p.thickness * 0.25
    } else if (inField) {
      r = Math.sqrt(rand()) * p.radius
      a = rand() * Math.PI * 2
      yy = gauss() * p.thickness * (1.6 - r / p.radius)
    } else {
      // arm population, kept out of the bulge core
      r = (0.12 + 0.88 * Math.pow(rand(), 1.7)) * p.radius
      const t = r / p.radius
      a = model.sample(i % arms, r, t, rand, gauss)
      yy = gauss() * p.thickness * (1.0 - 0.75 * t)
    }

    // fuzzy edge: gaussian radial jitter, stronger outward, soft cap at 1.2x
    if (!inBulge) r += gauss() * 0.15 * (0.3 + r / p.radius)
    r = Math.min(1.2 * p.radius, Math.max(0, r))
    const t = Math.min(1, r / p.radius)
    radius[i] = r
    angle[i] = a
    y[i] = yy

    let [cr, cg, cb] = inBulge ? p.palette[0] : paletteAt(p.palette, t)

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

    // power-law sizes: mostly small, a handful of bright giants that wash
    // evenly toward white. The bulge is an old population with no giants.
    const s = Math.pow(rand(), inBulge ? 6 : 4)
    const giant = !inBulge && s > BRIGHT_GIANT_CUTOFF
    size[i] = (0.6 + s * 4.5) * (inBulge ? 1.2 : 1.0)
    spike[i] = giant ? 1 : 0
    const brighten = giant ? 1.4 : 1.0

    color[i * 3] = clamp01(cr * jitter * brighten)
    color[i * 3 + 1] = clamp01(cg * jitter * brighten)
    color[i * 3 + 2] = clamp01(cb * jitter * brighten)
  }

  return sortByY({ radius, angle, y, color, size, spike })
}

// Sort every buffer by y so galaxy.ts can draw the below-plane half and the
// above-plane half as two draw ranges around the dust layer.
function sortByY(b: Omit<GalaxyBuffers, 'splitIndex'>): GalaxyBuffers {
  const n = b.y.length
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  order.sort((i, j) => b.y[i] - b.y[j])

  const permute = (src: Float32Array) => {
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = src[order[i]]
    return out
  }
  const color = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const j = order[i]
    color[i * 3] = b.color[j * 3]
    color[i * 3 + 1] = b.color[j * 3 + 1]
    color[i * 3 + 2] = b.color[j * 3 + 2]
  }
  const y = permute(b.y)
  let splitIndex = 0
  while (splitIndex < n && y[splitIndex] < 0) splitIndex++

  return {
    radius: permute(b.radius),
    angle: permute(b.angle),
    y,
    color,
    size: permute(b.size),
    spike: permute(b.spike),
    splitIndex,
  }
}
