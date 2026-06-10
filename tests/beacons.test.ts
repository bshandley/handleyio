import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Raycaster, Vector2 } from 'three'
import { createBeacons } from '../src/nodes/beacons'
import { NODES } from '../src/nodes/registry'

describe('beacons', () => {
  const beacons = createBeacons(NODES)

  it('creates one beacon per node', () => {
    expect(beacons.group.children.length).toBeGreaterThanOrEqual(NODES.length)
  })

  it('pick returns the node id under the pointer', () => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 200)
    // place camera looking straight at the github node
    const [x, y, z] = NODES[0].position
    camera.position.set(x, y, z + 3)
    camera.lookAt(x, y, z)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(0, 0), camera)
    expect(beacons.pick(ray)).toBe('github')
  })

  it('pick returns null when nothing is hit', () => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 200)
    camera.position.set(0, 50, 0)
    camera.lookAt(0, 100, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(0, 0), camera)
    expect(beacons.pick(ray)).toBeNull()
  })
})
