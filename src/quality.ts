export const TIERS = [60_000, 40_000, 25_000, 15_000] as const

const LOW_FPS = 28
const SUSTAIN_SECONDS = 3

export function pickInitialCount(width: number, height: number, cores: number): number {
  const pixels = width * height
  if (pixels >= 1_500_000 && cores >= 8) return TIERS[0]
  if (pixels >= 700_000 && cores >= 4) return TIERS[1]
  return TIERS[2]
}

export class FpsGovernor {
  private belowFor = 0
  private tierIndex: number

  constructor(currentCount: number) {
    this.tierIndex = Math.max(0, TIERS.findIndex((t) => t <= currentCount))
  }

  /** Returns a new particle count when a step down is due, else null. */
  update(dt: number): number | null {
    if (this.tierIndex >= TIERS.length - 1) return null
    const fps = 1 / Math.max(dt, 1e-6)
    this.belowFor = fps < LOW_FPS ? this.belowFor + dt : 0
    if (this.belowFor >= SUSTAIN_SECONDS) {
      this.belowFor = 0
      this.tierIndex += 1
      return TIERS[this.tierIndex]
    }
    return null
  }
}
