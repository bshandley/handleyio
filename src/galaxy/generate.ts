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

export function generateGalaxy(
  p: GalaxyParams,
  rand: () => number = Math.random,
): GalaxyBuffers {
  const radius = new Float32Array(p.count)
  const angle = new Float32Array(p.count)
  const y = new Float32Array(p.count)
  const color = new Float32Array(p.count * 3)
  const size = new Float32Array(p.count)

  for (let i = 0; i < p.count; i++) {
    const r = Math.pow(rand(), 2.0) * p.radius
    const t = r / p.radius
    const arm = i % p.arms
    const armAngle = (arm / p.arms) * Math.PI * 2
    const scatter = (rand() - 0.5) * (0.25 + t * 0.9)
    radius[i] = r
    angle[i] = armAngle + r * p.spin + scatter

    const gauss = rand() + rand() + rand() - 1.5
    y[i] = gauss * p.thickness * (1.0 - 0.75 * t)

    const [c0, c1] =
      t < 0.5 ? [p.coreColor, p.midColor] : [p.midColor, p.edgeColor]
    const tt = t < 0.5 ? t * 2 : (t - 0.5) * 2
    const jitter = 0.85 + rand() * 0.15
    const dust = rand() < 0.06 ? 0.35 : 1.0
    color[i * 3] = Math.min(1, Math.max(0, lerp(c0[0], c1[0], tt) * jitter * dust))
    color[i * 3 + 1] = Math.min(1, Math.max(0, lerp(c0[1], c1[1], tt) * jitter * dust))
    color[i * 3 + 2] = Math.min(1, Math.max(0, lerp(c0[2], c1[2], tt) * jitter * dust))

    size[i] = (0.6 + rand() * 1.4) * (t < 0.15 ? 1.5 : 1.0)
  }

  return { radius, angle, y, color, size }
}
