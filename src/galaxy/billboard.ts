import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector2,
  Vector3,
} from 'three'
import { orbitChunk } from './shaders'
import { clamp01 } from './math'

// Camera-facing instanced quads for the large soft sprites (glow, dust,
// deep field). Points are not used here: gl_PointSize is hardware-capped
// on some mobile GPUs and cannot sample a rotated atlas cell.

export interface BillboardBuffers {
  radius: Float32Array
  angle: Float32Array
  y: Float32Array
  /** World-unit width of the quad. */
  size: Float32Array
  /** In-plane rotation (radians). */
  rotation: Float32Array
  /** Layer-specific: atlas cell for dust, aspect ratio for the deep field, unused for glow. */
  shape: Float32Array
  color: Float32Array
  alpha: Float32Array
}

export function allocBillboards(count: number): BillboardBuffers {
  return {
    radius: new Float32Array(count),
    angle: new Float32Array(count),
    y: new Float32Array(count),
    size: new Float32Array(count),
    rotation: new Float32Array(count),
    shape: new Float32Array(count),
    color: new Float32Array(count * 3),
    alpha: new Float32Array(count),
  }
}

const QUAD = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0])
const QUAD_INDEX = [0, 1, 2, 0, 2, 3]

export function createBillboardGeometry(
  b: BillboardBuffers,
  boundingRadius: number,
): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(QUAD, 3))
  geometry.setIndex(QUAD_INDEX)
  geometry.setAttribute('aRadius', new InstancedBufferAttribute(b.radius, 1))
  geometry.setAttribute('aAngle', new InstancedBufferAttribute(b.angle, 1))
  geometry.setAttribute('aY', new InstancedBufferAttribute(b.y, 1))
  geometry.setAttribute('aSize', new InstancedBufferAttribute(b.size, 1))
  geometry.setAttribute('aRotation', new InstancedBufferAttribute(b.rotation, 1))
  geometry.setAttribute('aShape', new InstancedBufferAttribute(b.shape, 1))
  geometry.setAttribute('aColor', new InstancedBufferAttribute(b.color, 3))
  geometry.setAttribute('aAlpha', new InstancedBufferAttribute(b.alpha, 1))
  geometry.instanceCount = b.radius.length
  geometry.boundingSphere = new Sphere(new Vector3(), boundingRadius)
  return geometry
}

/** Draw only the first `fraction` of instances (quality ladder); no rebuild. */
export function setInstanceFraction(geometry: InstancedBufferGeometry, fraction: number): void {
  geometry.instanceCount = Math.round(geometry.attributes.aRadius.count * clamp01(fraction))
}

/** Uniforms every billboard material shares. Viewport is in drawing-buffer pixels. */
export function billboardUniforms(width: number, height: number) {
  return {
    uTime: { value: 0 },
    uOrbit: { value: 1 },
    uViewport: { value: new Vector2(width, height) },
    // no sprite wider than half the viewport, however close the camera gets
    uMaxPx: { value: height * 0.5 },
    // sprites fade out inside this camera distance so the disc never fills the screen
    uNearFade: { value: 1.5 },
  }
}

export const billboardVertex =
  orbitChunk +
  /* glsl */ `
uniform vec2 uViewport;
uniform float uMaxPx;
uniform float uNearFade;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute float aRotation;
attribute float aShape;
attribute float aAlpha;
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;

void main() {
  vec4 mv = modelViewMatrix * vec4(orbitPosition(aRadius, aAngle, aY), 1.0);
  float dist = max(0.001, -mv.z);
  // pixels per world unit at this depth: half the viewport height times cot(fov/2)
  float pxPerUnit = 0.5 * uViewport.y * projectionMatrix[1][1] / dist;
  float size = min(aSize, uMaxPx / pxPerUnit);
  float c = cos(aRotation);
  float s = sin(aRotation);
  vec2 corner = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  mv.xy += corner * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vColor = aColor;
  vAlpha = aAlpha * smoothstep(uNearFade * 0.5, uNearFade, dist);
  vShape = aShape;
}
`
