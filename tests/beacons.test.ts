import { describe, expect, it } from 'vitest'
import { Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { beaconFragment, createBeacons } from '../src/nodes/beacons'
import { NODES } from '../src/nodes/registry'
import { orbitPosition, solveElements } from '../src/galaxy/orbit'
import { RENDER_ORDER } from '../src/galaxy/order'

function lookAt(pos: Vector3) {
  const camera = new PerspectiveCamera(55, 1, 0.1, 200)
  camera.position.set(pos.x, pos.y, pos.z + 3)
  camera.lookAt(pos.x, pos.y, pos.z)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(0, 0), camera)
  return ray
}

describe('beacons', () => {
  const beacons = createBeacons(NODES)

  it('draws every node in one instanced mesh plus one hit sphere per node', () => {
    const meshes = beacons.group.children.filter((c) => (c as Mesh).isMesh)
    expect(meshes.length).toBe(NODES.length + 1)
    const instanced = meshes.find((m) => 'instanceCount' in (m as Mesh).geometry) as Mesh
    expect(instanced).toBeDefined()
    expect((instanced.geometry as unknown as { instanceCount: number }).instanceCount).toBe(
      NODES.length,
    )
  })

  it('pick returns the node id under the pointer', () => {
    const [x, y, z] = NODES[0].position
    expect(beacons.pick(lookAt(new Vector3(x, y, z)))).toBe('github')
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

  it('fragment draws a spiked core and a pulsing ring', () => {
    expect(beaconFragment).toContain('ring')
    expect(beaconFragment).toContain('uTime')
  })
})

describe('beacon orbit', () => {
  it('update(0) keeps beacons at their registry positions', () => {
    const orbiting = createBeacons(NODES)
    orbiting.update(0)
    const [x, y, z] = NODES[0].position
    const pos = orbiting.worldPosition('github')
    expect(pos.x).toBeCloseTo(x, 4)
    expect(pos.y).toBeCloseTo(y, 6)
    expect(pos.z).toBeCloseTo(z, 4)
  })

  it('update(elapsed) follows the density-wave orbit through the registry position', () => {
    const orbiting = createBeacons(NODES)
    const [x, y, z] = NODES[0].position
    const expected = orbitPosition(solveElements(x, y, z, 0), 10, new Vector3())
    orbiting.update(10)
    const pos = orbiting.worldPosition('github')
    expect(pos.x).toBeCloseTo(expected.x, 5)
    expect(pos.y).toBeCloseTo(expected.y, 5)
    expect(pos.z).toBeCloseTo(expected.z, 5)
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
    expect(orbiting.pick(lookAt(orbiting.worldPosition('github')))).toBe('github')
  })

  it('feeds the GPU the same time it moves the hit spheres with', () => {
    const orbiting = createBeacons(NODES)
    orbiting.update(33)
    const instanced = orbiting.group.children.find(
      (c) => 'instanceCount' in (c as Mesh).geometry,
    ) as Mesh
    const material = instanced.material as unknown as { uniforms: { uTime: { value: number } } }
    expect(material.uniforms.uTime.value).toBe(33)
    expect(instanced.renderOrder).toBe(0) // groupOrder on beacons.group carries the layer order
    expect(RENDER_ORDER.beacons).toBeGreaterThan(RENDER_ORDER.nearStars)
  })
})
