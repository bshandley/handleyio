import { AdditiveBlending, InstancedBufferGeometry, Mesh, ShaderMaterial } from 'three'
import {
  allocBillboards,
  billboardUniforms,
  billboardVertex,
  createBillboardGeometry,
  type BillboardBuffers,
} from './billboard'
import { lerp } from './math'
import { RENDER_ORDER } from './order'

// Distant galaxies: a few dozen faint elliptical smudges on the far shell.
// Same billboard chunk as the galaxy layers with orbiting switched off.

export function generateDeepField(count: number, rand: () => number = Math.random): BillboardBuffers {
  const b = allocBillboards(count)
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1
    const phi = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 45 + rand() * 10
    b.radius[i] = s * r
    b.angle[i] = phi
    b.y[i] = u * r
    b.size[i] = lerp(0.4, 1.2, rand())
    b.rotation[i] = rand() * Math.PI * 2
    b.shape[i] = lerp(1.5, 3.5, rand()) // aspect ratio
    const warm = rand() < 0.5
    b.color[i * 3] = warm ? 1.0 : 0.8
    b.color[i * 3 + 1] = 0.85
    b.color[i * 3 + 2] = warm ? 0.7 : 1.0
    b.alpha[i] = lerp(0.15, 0.35, rand())
  }
  return b
}

const deepFieldFragment = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;

void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  d.y *= vShape;
  float r2 = dot(d, d);
  float a = exp(-r2 * 5.0) + 0.5 * exp(-r2 * 1.5) * (1.0 - smoothstep(0.5, 1.0, r2));
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`

export interface DeepField {
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  setViewport(width: number, height: number): void
  dispose(): void
}

export function createDeepField(
  width: number,
  height: number,
  count = 40,
  rand: () => number = Math.random,
): DeepField {
  const uniforms = billboardUniforms(width, height)
  uniforms.uOrbit.value = 0
  const material = new ShaderMaterial({
    vertexShader: billboardVertex,
    fragmentShader: deepFieldFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const geometry = createBillboardGeometry(generateDeepField(count, rand), 60)
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = RENDER_ORDER.background
  return {
    mesh,
    setViewport(w, h) {
      uniforms.uViewport.value.set(w, h)
      uniforms.uMaxPx.value = h * 0.5
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
