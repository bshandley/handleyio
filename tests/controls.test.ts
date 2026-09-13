import { describe, expect, it } from 'vitest'
import { MAX_DISTANCE, MAX_POLAR_DEG, MIN_DISTANCE, MIN_POLAR_DEG } from '../src/camera/controls'
import { FADE_FULL } from '../src/galaxy/dust'
import { GALAXY_DEFAULTS } from '../src/galaxy/generate'

describe('camera limits', () => {
  it('keeps the camera off the plane on both sides', () => {
    expect(MIN_POLAR_DEG).toBe(12)
    expect(MAX_POLAR_DEG).toBe(180 - MIN_POLAR_DEG)
  })

  it('never lets the dust plane fade engage in normal use', () => {
    expect(Math.sin((MIN_POLAR_DEG * Math.PI) / 180)).toBeGreaterThan(FADE_FULL)
  })

  it('keeps the closest approach outside the nominal disc', () => {
    expect(MIN_DISTANCE).toBeGreaterThan(GALAXY_DEFAULTS.radius)
    expect(MAX_DISTANCE).toBeGreaterThan(MIN_DISTANCE)
  })
})
