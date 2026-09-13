import { describe, expect, it } from 'vitest'
import { MAX_DISTANCE, MIN_DISTANCE } from '../src/camera/controls'
import { GALAXY_DEFAULTS } from '../src/galaxy/generate'

describe('camera limits', () => {
  it('keeps round one closest approach, inside the nominal disc', () => {
    expect(MIN_DISTANCE).toBe(4)
    expect(MIN_DISTANCE).toBeLessThan(GALAXY_DEFAULTS.radius)
    expect(MAX_DISTANCE).toBeGreaterThan(MIN_DISTANCE)
  })
})
