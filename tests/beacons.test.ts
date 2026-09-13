import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Raycaster, Vector2 } from 'three'
import { createBeacons } from '../src/nodes/beacons'
import { NODES } from '../src/nodes/registry'
import { orbitalSpeed } from '../src/galaxy/generate'

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

describe('beacon orbit', () => {
  it('update(elapsed) orbits each beacon like a galaxy particle at its radius', () => {
    const orbiting = createBeacons(NODES)
    const [x, y, z] = NODES[0].position
    const radius = Math.hypot(x, z)
    const t = 10
    const angle = Math.atan2(z, x) + orbitalSpeed(radius) * t
    orbiting.update(t)
    const pos = orbiting.worldPosition('github')
    expect(pos.x).toBeCloseTo(Math.cos(angle) * radius, 5)
    expect(pos.z).toBeCloseTo(Math.sin(angle) * radius, 5)
    expect(pos.y).toBeCloseTo(y, 5)
  })

  it('update(0) keeps beacons at their registry positions', () => {
    const orbiting = createBeacons(NODES)
    orbiting.update(0)
    const [x, y, z] = NODES[0].position
    const pos = orbiting.worldPosition('github')
    expect(pos.x).toBeCloseTo(x, 5)
    expect(pos.y).toBeCloseTo(y, 5)
    expect(pos.z).toBeCloseTo(z, 5)
  })

  it('worldPosition returns a live reference that tracks updates', () => {
    const orbiting = createBeacons(NODES)
    const pos = orbiting.worldPosition('github')
    const before = pos.x
    orbiting.update(20)
    expect(pos.x).not.toBeCloseTo(before, 5)
  })

  it('picking still works after an orbit update', () => {
    const orbiting = createBeacons(NODES)
    orbiting.update(15)
    const pos = orbiting.worldPosition('github')
    const camera = new PerspectiveCamera(55, 1, 0.1, 200)
    camera.position.set(pos.x, pos.y, pos.z + 3)
    camera.lookAt(pos.x, pos.y, pos.z)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(0, 0), camera)
    expect(orbiting.pick(ray)).toBe('github')
  })
})
