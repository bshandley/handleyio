// Quality ladder. Stepping down drops bloom first, then layer density
// (instance counts, no rebuild), then the resolved star count.

export interface QualityLevel {
  stars: number
  /** Fraction of glow instances drawn. */
  glow: number
  /** Fraction of dust instances drawn. */
  dust: number
  bloom: boolean
  pixelRatioCap: number
}

export const LADDER: readonly QualityLevel[] = [
  { stars: 60_000, glow: 1, dust: 1, bloom: true, pixelRatioCap: 2 },
  { stars: 60_000, glow: 1, dust: 1, bloom: false, pixelRatioCap: 2 },
  { stars: 60_000, glow: 0.5, dust: 0.5, bloom: false, pixelRatioCap: 2 },
  { stars: 40_000, glow: 0.5, dust: 0.5, bloom: false, pixelRatioCap: 2 },
  { stars: 25_000, glow: 0.5, dust: 0.5, bloom: false, pixelRatioCap: 1.5 },
  { stars: 15_000, glow: 0, dust: 0, bloom: false, pixelRatioCap: 1 },
]

const LOW_FPS = 28
const SUSTAIN_SECONDS = 3

/** Index into LADDER. Coarse pointers (phones, tablets) never start with bloom. */
export function pickInitialLevel(
  width: number,
  height: number,
  cores: number,
  coarsePointer: boolean,
): number {
  const pixels = width * height
  if (!coarsePointer && pixels >= 1_500_000 && cores >= 8) return 0
  if (pixels >= 700_000 && cores >= 4) return 3
  return 4
}

/**
 * Dev aid: `?level=N` pins a ladder index and disables the governor, so a
 * screenshot shows the level it asks for. Returns null when the parameter is
 * absent or not a number; otherwise an integer index clamped to the ladder.
 */
export function parseLevelParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('level')
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return Math.min(LADDER.length - 1, Math.max(0, Math.floor(value)))
}

export class FpsGovernor {
  private belowFor = 0
  private level: number

  constructor(levelIndex: number) {
    this.level = levelIndex
  }

  /** Returns the next ladder index when a step down is due, else null. */
  update(dt: number): number | null {
    if (this.level >= LADDER.length - 1) return null
    const fps = 1 / Math.max(dt, 1e-6)
    this.belowFor = fps < LOW_FPS ? this.belowFor + dt : 0
    if (this.belowFor >= SUSTAIN_SECONDS) {
      this.belowFor = 0
      this.level += 1
      return this.level
    }
    return null
  }
}
