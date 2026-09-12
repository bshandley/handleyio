import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import type { ArmModel } from './arms'
import { generateGalaxy, GALAXY_DEFAULTS, type GalaxyParams } from './generate'
import { RENDER_ORDER } from './order'
import { galaxyFragment, galaxyVertex, orbitUniforms } from './shaders'

export const STAR_INTENSITY = 0.36
const BASE_POINT_SIZE = 22

export interface Galaxy {
  group: Group
  /** Stars below the plane (y < 0); shares attribute buffers with `above`. */
  below: Points
  above: Points
  setTime(t: number): void
  setPixelRatio(pr: number): void
  /** Draw the far half before the dust layer and the near half after it. */
  setCameraSide(cameraAbovePlane: boolean): void
  rebuild(count: number): void
  dispose(): void
}

export function createGalaxy(
  model: ArmModel,
  overrides: Partial<GalaxyParams> = {},
  pixelRatio = 1,
  rand: () => number = Math.random,
): Galaxy {
  const params = { ...GALAXY_DEFAULTS, ...overrides }

  const material = new ShaderMaterial({
    vertexShader: galaxyVertex,
    fragmentShader: galaxyFragment,
    uniforms: {
      ...orbitUniforms(),
      uSize: { value: BASE_POINT_SIZE * pixelRatio },
      uIntensity: { value: STAR_INTENSITY },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  let geometries = buildGeometries(params, model, rand)
  const below = new Points(geometries.below, material)
  const above = new Points(geometries.above, material)
  below.frustumCulled = false
  above.frustumCulled = false
  const group = new Group()
  group.add(below, above)

  const galaxy: Galaxy = {
    group,
    below,
    above,
    setTime(t) {
      material.uniforms.uTime.value = t
    },
    setPixelRatio(pr) {
      material.uniforms.uSize.value = BASE_POINT_SIZE * pr
    },
    setCameraSide(cameraAbovePlane) {
      below.renderOrder = cameraAbovePlane ? RENDER_ORDER.farStars : RENDER_ORDER.nearStars
      above.renderOrder = cameraAbovePlane ? RENDER_ORDER.nearStars : RENDER_ORDER.farStars
    },
    rebuild(count) {
      const fresh = buildGeometries({ ...params, count }, model, rand)
      below.geometry = fresh.below
      above.geometry = fresh.above
      geometries.below.dispose()
      geometries.above.dispose()
      geometries = fresh
    },
    dispose() {
      geometries.below.dispose()
      geometries.above.dispose()
      material.dispose()
    },
  }
  galaxy.setCameraSide(true)
  return galaxy
}

// Two geometries over one set of attribute buffers, split at the plane.
function buildGeometries(
  params: GalaxyParams,
  model: ArmModel,
  rand: () => number,
): { below: BufferGeometry; above: BufferGeometry } {
  const g = generateGalaxy(params, model, rand)
  const attributes = {
    // position is required by Points for draw count; real placement is in the shader
    position: new BufferAttribute(new Float32Array(params.count * 3), 3),
    aRadius: new BufferAttribute(g.radius, 1),
    aAngle: new BufferAttribute(g.angle, 1),
    aY: new BufferAttribute(g.y, 1),
    aColor: new BufferAttribute(g.color, 3),
    aSize: new BufferAttribute(g.size, 1),
    aSpike: new BufferAttribute(g.spike, 1),
    aEcc: new BufferAttribute(g.ecc, 1),
  }
  const make = (start: number, count: number) => {
    const geometry = new BufferGeometry()
    for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute)
    geometry.setDrawRange(start, count)
    geometry.boundingSphere = new Sphere(new Vector3(), params.radius * 1.2)
    return geometry
  }
  return {
    below: make(0, g.splitIndex),
    above: make(g.splitIndex, params.count - g.splitIndex),
  }
}
