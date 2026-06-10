import { describe, expect, it } from 'vitest'
import { nextAzimuth } from '../src/hud/nodenav'

const TAU = Math.PI * 2

describe('nextAzimuth', () => {
  const angles = [0, 2, 4]

  it('picks the nearest node in the positive direction', () => {
    expect(nextAzimuth(0, angles, 1)).toBeCloseTo(2, 5)
    expect(nextAzimuth(2.5, angles, 1)).toBeCloseTo(4, 5)
  })

  it('picks the nearest node in the negative direction, wrapping', () => {
    // from 0 going negative, the nearest is the node at 4 (one wrap down)
    expect(nextAzimuth(0, angles, -1)).toBeCloseTo(4 - TAU, 5)
  })

  it('skips the node the camera is already centered on', () => {
    expect(nextAzimuth(2.01, angles, 1)).toBeCloseTo(4, 5)
    expect(nextAzimuth(2.01, angles, -1)).toBeCloseTo(0, 5)
  })

  it('returns current when there are no nodes', () => {
    expect(nextAzimuth(1, [], 1)).toBe(1)
  })
})
