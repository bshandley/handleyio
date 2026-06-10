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
import type { GalaxyNode } from './registry'

const HIT_RADIUS = 0.4

export interface Beacons {
  group: Group
  pick(ray: Raycaster): string | null
  pulse(elapsed: number): void
  worldPosition(id: string): Vector3
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
  const sprites = new Map<string, Sprite>()
  const texture = haloTexture()

  for (const node of nodes) {
    const geometry = new SphereGeometry(HIT_RADIUS, 8, 8)
    geometry.computeBoundingSphere()
    const hit = new Mesh(
      geometry,
      new MeshBasicMaterial({ visible: false }),
    )
    hit.position.set(...node.position)
    hit.updateMatrixWorld(true)
    hit.userData.nodeId = node.id
    hitMeshes.push(hit)
    group.add(hit)

    if (texture) {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: texture,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      )
      sprite.position.set(...node.position)
      sprite.scale.setScalar(0.5)
      sprites.set(node.id, sprite)
      group.add(sprite)
    }
  }

  return {
    group,
    pick(ray) {
      const hits = ray.intersectObjects(hitMeshes, false)
      return hits.length ? (hits[0].object.userData.nodeId as string) : null
    },
    pulse(elapsed) {
      let i = 0
      for (const sprite of sprites.values()) {
        sprite.scale.setScalar(0.5 + 0.08 * Math.sin(elapsed * 2.2 + i++ * 1.7))
      }
    },
    worldPosition(id) {
      const mesh = hitMeshes.find((m) => m.userData.nodeId === id)
      if (!mesh) throw new Error(`unknown node: ${id}`)
      return mesh.position.clone()
    },
  }
}
