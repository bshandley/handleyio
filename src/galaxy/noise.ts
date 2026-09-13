// Deterministic value noise for the procedural dust atlas. Pure functions,
// no DOM, so the cell renderer is unit-testable; dust.ts paints cells into
// a canvas texture.

export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const a = hash2(x0, y0, seed)
  const b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed)
  const d = hash2(x0 + 1, y0 + 1, seed)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return top + (bottom - top) * fy
}

export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let freq = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 101)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/**
 * One atlas cell: a filamentary cloud mask in [0, 1] with a soft radial
 * edge. `aspect` above 1 stretches the cloud and its filaments along x, for
 * cells that lie along a dust lane.
 */
export function renderCloudCell(size: number, seed: number, aspect = 1): Float32Array {
  const out = new Float32Array(size * size)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size * 2 - 1
      const v = (py + 0.5) / size * 2 - 1
      const rad = Math.hypot(u, v * aspect)
      const edge = 1 - smoothClamp(rad, 0.55, 1.0)
      const n = fbm((u * 2.5) / aspect + seed * 7, v * 2.5 + seed * 3, seed)
      const filaments = smoothClamp(n, 0.38, 0.72)
      out[py * size + px] = filaments * edge
    }
  }
  return out
}

function smoothClamp(v: number, lo: number, hi: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return smooth(t)
}
