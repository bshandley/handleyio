import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three'
import { clamp01 } from './math'
import { RENDER_ORDER } from './order'
import { starProfileChunk } from './shaders'

// Background stars on a far shell: screen-space sizes on a power law, a
// temperature mix (mostly white and blue-white, a minority orange), and a
// handful of bright foreground stars with diffraction spikes.

export const STARFIELD_INTENSITY = 0.6

export interface StarfieldBuffers {
  position: Float32Array
  color: Float32Array
  size: Float32Array
  spike: Float32Array
}

export function generateStarfield(
  count: number,
  brightCount: number,
  rand: () => number = Math.random,
): StarfieldBuffers {
  const position = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const spike = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // random point on a far shell, radius 40-60
    const u = rand() * 2 - 1
    const phi = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 40 + rand() * 20
    position[i * 3] = s * Math.cos(phi) * r
    position[i * 3 + 1] = u * r
    position[i * 3 + 2] = s * Math.sin(phi) * r

    const roll = rand()
    let c: [number, number, number]
    if (roll < 0.15) c = [1.0, 0.72, 0.5] // orange
    else if (roll < 0.45) c = [0.72, 0.8, 1.0] // blue-white
    else c = [0.92, 0.93, 1.0] // white
    const jitter = 0.85 + rand() * 0.15
    color[i * 3] = clamp01(c[0] * jitter)
    color[i * 3 + 1] = clamp01(c[1] * jitter)
    color[i * 3 + 2] = clamp01(c[2] * jitter)

    const bright = i < brightCount
    // screen-space pixels at pixel ratio 1
    size[i] = bright ? 3.5 + rand() * 1.5 : 0.6 + Math.pow(rand(), 5) * 2.4
    spike[i] = bright ? 1 : 0
  }
  return { position, color, size, spike }
}

const starfieldVertex = /* glsl */ `
uniform float uPixelRatio;
attribute float aSize;
attribute float aSpike;
attribute vec3 aColor;
varying vec3 vColor;
varying float vSpike;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uPixelRatio;
  gl_PointSize = aSpike > 0.5 ? px * 3.0 : px;
  vColor = aColor;
  vSpike = aSpike;
}
`

const starfieldFragment =
  starProfileChunk +
  /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
varying float vSpike;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float alpha = vSpike > 0.5 ? starCore(p * 3.0) + starSpikes(p) : starCore(p);
  gl_FragColor = vec4(vColor * uIntensity, alpha);
}
`

export interface Starfield {
  points: Points<BufferGeometry, ShaderMaterial>
  setPixelRatio(pr: number): void
  dispose(): void
}

export function createStarfield(
  pixelRatio = 1,
  count = 2500,
  brightCount = 24,
  rand: () => number = Math.random,
): Starfield {
  const s = generateStarfield(count, brightCount, rand)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(s.position, 3))
  geometry.setAttribute('aColor', new BufferAttribute(s.color, 3))
  geometry.setAttribute('aSize', new BufferAttribute(s.size, 1))
  geometry.setAttribute('aSpike', new BufferAttribute(s.spike, 1))
  const material = new ShaderMaterial({
    vertexShader: starfieldVertex,
    fragmentShader: starfieldFragment,
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uIntensity: { value: STARFIELD_INTENSITY },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geometry, material)
  points.renderOrder = RENDER_ORDER.background
  return {
    points,
    setPixelRatio(pr) {
      material.uniforms.uPixelRatio.value = pr
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
