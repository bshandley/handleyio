export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Approximately normal, sd 0.5: sum of three uniforms minus 1.5. */
export function makeGauss(rand: () => number): () => number {
  return () => rand() + rand() + rand() - 1.5
}
