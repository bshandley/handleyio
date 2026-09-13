import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import {
  allocBillboards,
  billboardUniforms,
  billboardVertex,
  createBillboardGeometry,
} from '../galaxy/billboard'
import { orbitPosition, solveElements, type Elements } from '../galaxy/orbit'
import type { GalaxyNode } from './registry'

// Beacons are bright stars in the disc: one instanced billboard draws every
// node (spiked core above 1.0 so bloom lifts it, plus a slow pulsing ring),
// placed by the shared orbit chunk on the GPU. The CPU keeps invisible hit
// spheres on the same curve for picking, focus, and the HUD.

const HIT_RADIUS = 0.4
/** HUD accent; Color converts the sRGB hex to linear for the shader. */
export const BEACON_COLOR = '#8cc0ff'
export const BEACON_INTENSITY = 1.8
/** Quad width in world units. */
export const BEACON_SIZE = 0.55

export interface Beacons {
  group: Group
  pick(ray: Raycaster): string | null
  /** Orbit beacons like galaxy particles and pulse their rings. */
  update(elapsed: number): void
  /** Live position reference; tracks update() without copying. */
  worldPosition(id: string): Vector3
  /** Drawing-buffer pixels; keeps the sprite's pixel cap in sync with the canvas. */
  setViewport(width: number, height: number): void
}

interface Orbit {
  elements: Elements
  hit: Mesh
}

export const beaconFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;

void main() {
  vec2 p = vUv - 0.5;
  float d2 = dot(p, p);
  float len = sqrt(d2);
  float core = exp(-d2 * 90.0) + 0.08 * exp(-d2 * 10.0);
  float reach = max(0.0, 1.0 - len * 2.0);
  float spikes = 0.3 * reach * reach * (exp(-abs(p.y) * 70.0) + exp(-abs(p.x) * 70.0));
  float pulse = 0.5 + 0.5 * sin(uTime * 2.2 + vShape);
  float ringR = 0.30 + 0.06 * pulse;
  float dr = (len - ringR) * 40.0;
  float ring = exp(-dr * dr) * (0.25 + 0.2 * pulse);
  float edge = 1.0 - smoothstep(0.45, 0.5, len);
  gl_FragColor = vec4(vColor * uIntensity, (core + spikes + ring) * edge * vAlpha);
}
`

export function createBeacons(nodes: GalaxyNode[]): Beacons {
  const group = new Group()
  const hitMeshes: Mesh[] = []
  const orbits = new Map<string, Orbit>()
  const buffers = allocBillboards(nodes.length)
  const color = new Color(BEACON_COLOR)

  nodes.forEach((node, i) => {
    const [x, y, z] = node.position
    const elements = solveElements(x, y, z, 0)
    const geometry = new SphereGeometry(HIT_RADIUS, 8, 8)
    geometry.computeBoundingSphere()
    const hit = new Mesh(geometry, new MeshBasicMaterial({ visible: false }))
    hit.position.set(x, y, z)
    hit.updateMatrixWorld(true)
    hit.userData.nodeId = node.id
    hitMeshes.push(hit)
    group.add(hit)
    orbits.set(node.id, { elements, hit })

    buffers.radius[i] = elements.a
    buffers.angle[i] = elements.phase
    buffers.y[i] = elements.y
    buffers.ecc[i] = elements.ecc
    buffers.tilt[i] = 0
    buffers.size[i] = BEACON_SIZE
    buffers.rotation[i] = 0
    buffers.shape[i] = i * 1.7 // pulse phase
    buffers.color[i * 3] = color.r
    buffers.color[i * 3 + 1] = color.g
    buffers.color[i * 3 + 2] = color.b
    buffers.alpha[i] = 1
  })

  const uniforms = { ...billboardUniforms(1, 1), uIntensity: { value: BEACON_INTENSITY } }
  uniforms.uNearFade.value = 0.5
  const material = new ShaderMaterial({
    vertexShader: billboardVertex,
    fragmentShader: beaconFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const mesh = new Mesh(createBillboardGeometry(buffers, 6), material)
  mesh.frustumCulled = false
  group.add(mesh)

  return {
    group,
    pick(ray) {
      const hits = ray.intersectObjects(hitMeshes, false)
      return hits.length ? (hits[0].object.userData.nodeId as string) : null
    },
    update(elapsed) {
      uniforms.uTime.value = elapsed
      for (const orbit of orbits.values()) {
        orbitPosition(orbit.elements, elapsed, orbit.hit.position)
        orbit.hit.updateMatrixWorld(true)
      }
    },
    worldPosition(id) {
      const orbit = orbits.get(id)
      if (!orbit) throw new Error(`unknown node: ${id}`)
      return orbit.hit.position
    },
    setViewport(width, height) {
      uniforms.uViewport.value.set(width, height)
      uniforms.uMaxPx.value = height * 0.5
    },
  }
}
