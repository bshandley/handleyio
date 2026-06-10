import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { toScreen } from '../src/hud/projector'

describe('toScreen', () => {
  const camera = new PerspectiveCamera(55, 2, 0.1, 200)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()

  it('projects the origin to screen center', () => {
    const s = toScreen(new Vector3(0, 0, 0), camera, 800, 400)
    expect(s.visible).toBe(true)
    expect(s.x).toBeCloseTo(400)
    expect(s.y).toBeCloseTo(200)
  })

  it('marks points behind the camera as not visible', () => {
    const s = toScreen(new Vector3(0, 0, 20), camera, 800, 400)
    expect(s.visible).toBe(false)
  })

  it('maps +x to the right half', () => {
    const s = toScreen(new Vector3(2, 0, 0), camera, 800, 400)
    expect(s.x).toBeGreaterThan(400)
  })
})
