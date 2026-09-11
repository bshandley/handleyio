import { describe, expect, it } from 'vitest'
import { FpsGovernor, LADDER, parseLevelParam, pickInitialLevel } from '../src/quality'

describe('LADDER', () => {
  it('is ordered from most to least expensive, each step dropping something', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const hi = LADDER[i - 1]
      const lo = LADDER[i]
      expect(lo.stars).toBeLessThanOrEqual(hi.stars)
      expect(lo.glow).toBeLessThanOrEqual(hi.glow)
      expect(lo.dust).toBeLessThanOrEqual(hi.dust)
      expect(lo.pixelRatioCap).toBeLessThanOrEqual(hi.pixelRatioCap)
      expect(Number(lo.bloom)).toBeLessThanOrEqual(Number(hi.bloom))
      const changed =
        lo.stars < hi.stars ||
        lo.glow < hi.glow ||
        lo.dust < hi.dust ||
        lo.pixelRatioCap < hi.pixelRatioCap ||
        (hi.bloom && !lo.bloom)
      expect(changed).toBe(true)
    }
  })

  it('drops bloom before anything else', () => {
    expect(LADDER[0].bloom).toBe(true)
    expect(LADDER[1].bloom).toBe(false)
    expect(LADDER[1].stars).toBe(LADDER[0].stars)
    expect(LADDER[1].glow).toBe(LADDER[0].glow)
  })

  it('drops layer density before the star count falls below the second tier', () => {
    const firstStarDrop = LADDER.findIndex((l) => l.stars < LADDER[0].stars)
    expect(LADDER[firstStarDrop].glow).toBeLessThan(1)
  })
})

describe('pickInitialLevel', () => {
  it('gives big desktops the top level', () => {
    expect(pickInitialLevel(2560, 1440, 10, false)).toBe(0)
  })
  it('never starts a coarse-pointer device with bloom', () => {
    expect(LADDER[pickInitialLevel(2560, 1440, 10, true)].bloom).toBe(false)
    expect(LADDER[pickInitialLevel(390, 844, 6, true)].bloom).toBe(false)
  })
  it('gives phones a reduced level', () => {
    expect(LADDER[pickInitialLevel(390, 844, 6, true)].stars).toBeLessThanOrEqual(25_000)
  })
})

describe('parseLevelParam', () => {
  it('returns null when the parameter is absent or not a number', () => {
    expect(parseLevelParam('')).toBeNull()
    expect(parseLevelParam('?foo=1')).toBeNull()
    expect(parseLevelParam('?level=')).toBeNull()
    expect(parseLevelParam('?level=high')).toBeNull()
  })

  it('returns the index for a value inside the ladder', () => {
    expect(parseLevelParam('?level=0')).toBe(0)
    expect(parseLevelParam('?level=2')).toBe(2)
    expect(parseLevelParam('?debug=1&level=1')).toBe(1)
  })

  it('clamps out-of-range values to the ladder ends', () => {
    expect(parseLevelParam('?level=99')).toBe(LADDER.length - 1)
    expect(parseLevelParam('?level=-4')).toBe(0)
    expect(parseLevelParam('?level=2.7')).toBe(2)
  })
})

describe('FpsGovernor', () => {
  it('steps down one level after sustained low fps', () => {
    const gov = new FpsGovernor(0)
    let stepped: number | null = null
    for (let i = 0; i < 60; i++) {
      const next = gov.update(1 / 15)
      if (next !== null) stepped = next
    }
    expect(stepped).toBe(1)
  })

  it('does not step down on good fps', () => {
    const gov = new FpsGovernor(0)
    for (let i = 0; i < 600; i++) expect(gov.update(1 / 60)).toBeNull()
  })

  it('stops at the lowest level', () => {
    const gov = new FpsGovernor(LADDER.length - 1)
    for (let i = 0; i < 600; i++) expect(gov.update(1 / 10)).toBeNull()
  })

  it('walks the whole ladder under sustained low fps', () => {
    const gov = new FpsGovernor(0)
    const seen: number[] = []
    for (let i = 0; i < 60 * LADDER.length; i++) {
      const next = gov.update(1 / 15)
      if (next !== null) seen.push(next)
    }
    expect(seen).toEqual(LADDER.map((_, i) => i).slice(1))
  })
})
