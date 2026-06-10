import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three'
import { generateGalaxy, GALAXY_DEFAULTS, type GalaxyParams } from './generate'
import { galaxyFragment, galaxyVertex } from './shaders'

export interface Galaxy {
  points: Points
  setTime(t: number): void
  rebuild(count: number): void
  dispose(): void
}

export function createGalaxy(overrides: Partial<GalaxyParams> = {}): Galaxy {
  const params = { ...GALAXY_DEFAULTS, ...overrides }

  const material = new ShaderMaterial({
    vertexShader: galaxyVertex,
    fragmentShader: galaxyFragment,
    uniforms: { uTime: { value: 0 }, uSize: { value: 22 * devicePixelRatio } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  let geometry = buildGeometry(params)
  const points = new Points(geometry, material)
  points.frustumCulled = false

  return {
    points,
    setTime(t) {
      material.uniforms.uTime.value = t
    },
    rebuild(count) {
      const fresh = buildGeometry({ ...params, count })
      points.geometry = fresh
      geometry.dispose()
      geometry = fresh
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

function buildGeometry(params: GalaxyParams): BufferGeometry {
  const g = generateGalaxy(params)
  const geometry = new BufferGeometry()
  // position is required by Points for draw count; real placement is in the shader
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(params.count * 3), 3))
  geometry.setAttribute('aRadius', new BufferAttribute(g.radius, 1))
  geometry.setAttribute('aAngle', new BufferAttribute(g.angle, 1))
  geometry.setAttribute('aY', new BufferAttribute(g.y, 1))
  geometry.setAttribute('aColor', new BufferAttribute(g.color, 3))
  geometry.setAttribute('aSize', new BufferAttribute(g.size, 1))
  geometry.boundingSphere = new Sphere(new Vector3(), params.radius * 1.2)
  return geometry
}
