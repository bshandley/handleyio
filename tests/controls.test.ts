import { describe, expect, it } from 'vitest'
import { MAX_DISTANCE, MAX_POLAR_DEG, MIN_DISTANCE } from '../src/camera/controls'
import { FADE_FULL } from '../src/galaxy/dust'
import { GALAXY_DEFAULTS } from '../src/galaxy/generate'

describe('camera limits', () => {
  it('keeps the camera above the plane and off it by at least 12 degrees', () => {
    expect(MAX_POLAR_DEG).toBe(78)
  })

  it('never lets the dust plane fade engage in normal use', () => {
    // MAX_POLAR_DEG is the camera's closest approach to the plane, so
    // cos(MAX_POLAR_DEG) is its minimum sine of elevation.
    expect(Math.cos((MAX_POLAR_DEG * Math.PI) / 180)).toBeGreaterThan(FADE_FULL)
  })

  it('keeps the closest approach outside the nominal disc', () => {
    expect(MIN_DISTANCE).toBeGreaterThan(GALAXY_DEFAULTS.radius)
    expect(MAX_DISTANCE).toBeGreaterThan(MIN_DISTANCE)
  })
})
