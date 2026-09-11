import { describe, expect, it } from 'vitest'
import { fbm, hash2, renderCloudCell, valueNoise } from '../src/galaxy/noise'

describe('noise', () => {
  it('hash is deterministic and in [0, 1)', () => {
    expect(hash2(3, 4, 1)).toBe(hash2(3, 4, 1))
    expect(hash2(3, 4, 1)).not.toBe(hash2(3, 4, 2))
    for (let i = 0; i < 100; i++) {
      const h = hash2(i, i * 7, 5)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
    }
  })

  it('value noise interpolates the lattice and stays in [0, 1]', () => {
    expect(valueNoise(2, 5, 1)).toBeCloseTo(hash2(2, 5, 1), 6)
    for (let i = 0; i < 200; i++) {
      const n = valueNoise(i * 0.37, i * 0.11, 1)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1)
    }
  })

  it('fbm stays in [0, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const n = fbm(i * 0.21, i * 0.13, 2)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1)
    }
  })

  it('cloud cell is soft-edged with structure inside', () => {
    const size = 32
    const cell = renderCloudCell(size, 3)
    expect(cell).toHaveLength(size * size)
    // corners fall outside the radial falloff
    expect(cell[0]).toBe(0)
    expect(cell[size - 1]).toBe(0)
    expect(cell[size * size - 1]).toBe(0)
    let max = 0
    let min = 1
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        const v = cell[y * size + x]
        max = Math.max(max, v)
        min = Math.min(min, v)
      }
    }
    expect(max).toBeGreaterThan(0.5)
    expect(min).toBeLessThan(0.5)
  })
})
