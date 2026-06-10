import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import { orbitalSpeed } from '../galaxy/generate'
import type { GalaxyNode } from './registry'

const HIT_RADIUS = 0.4

export interface Beacons {
  group: Group
  pick(ray: Raycaster): string | null
  /** Orbit beacons like galaxy particles and pulse their halos. */
  update(elapsed: number): void
  /** Live position reference; tracks update() without copying. */
  worldPosition(id: string): Vector3
}

interface Orbit {
  radius: number
  baseAngle: number
  y: number
  hit: Mesh
  sprite: Sprite | null
}

function haloTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(160,210,255,0.9)')
  grad.addColorStop(1, 'rgba(120,180,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

export function createBeacons(nodes: GalaxyNode[]): Beacons {
  const group = new Group()
  const hitMeshes: Mesh[] = []
  const orbits = new Map<string, Orbit>()
  const texture = haloTexture()

  for (const node of nodes) {
    const [x, y, z] = node.position
    const geometry = new SphereGeometry(HIT_RADIUS, 8, 8)
    geometry.computeBoundingSphere()
    const hit = new Mesh(geometry, new MeshBasicMaterial({ visible: false }))
    hit.position.set(x, y, z)
    hit.updateMatrixWorld(true)
    hit.userData.nodeId = node.id
    hitMeshes.push(hit)
    group.add(hit)

    let sprite: Sprite | null = null
    if (texture) {
      sprite = new Sprite(
        new SpriteMaterial({
          map: texture,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      )
      sprite.position.set(x, y, z)
      sprite.scale.setScalar(0.5)
      group.add(sprite)
    }

    orbits.set(node.id, {
      radius: Math.hypot(x, z),
      baseAngle: Math.atan2(z, x),
      y,
      hit,
      sprite,
    })
  }

  return {
    group,
    pick(ray) {
      const hits = ray.intersectObjects(hitMeshes, false)
      return hits.length ? (hits[0].object.userData.nodeId as string) : null
    },
    update(elapsed) {
      let i = 0
      for (const orbit of orbits.values()) {
        const angle = orbit.baseAngle + orbitalSpeed(orbit.radius) * elapsed
        const x = Math.cos(angle) * orbit.radius
        const z = Math.sin(angle) * orbit.radius
        orbit.hit.position.set(x, orbit.y, z)
        orbit.hit.updateMatrixWorld(true)
        if (orbit.sprite) {
          orbit.sprite.position.set(x, orbit.y, z)
          orbit.sprite.scale.setScalar(0.5 + 0.08 * Math.sin(elapsed * 2.2 + i * 1.7))
        }
        i++
      }
    },
    worldPosition(id) {
      const orbit = orbits.get(id)
      if (!orbit) throw new Error(`unknown node: ${id}`)
      return orbit.hit.position
    },
  }
}
