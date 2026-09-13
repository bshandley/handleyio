import { AdditiveBlending, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3 } from 'three'
import type { ArmModel } from './arms'
import {
  allocBillboards,
  billboardUniforms,
  billboardVertex,
  createBillboardGeometry,
  setInstanceFraction,
  type BillboardBuffers,
} from './billboard'
import { PALETTE, paletteAt, type Palette } from './generate'
import { lerp, makeGauss } from './math'
import { eccentricityAt } from './orbit'
import { RENDER_ORDER } from './order'

// Unresolved light: a few thousand small, dim, soft sprites following the
// arm density, plus a warm bulge. This is what turns dots into arms; the
// resolved stars are the sparkle on top. Instance count is the expensive
// dimension on a software rasterizer (CI), so haze density is bought with
// smaller sprites rather than more of them.

export interface GlowParams {
  count: number
  radius: number
  thickness: number
  bulgeRadius: number
  bulgeFraction: number
  /** Share of bulge haze in the compact core component. */
  bulgeCoreShare: number
  /** Core sigma as a fraction of bulgeRadius. */
  bulgeCoreSigma: number
  /** Halo sigma as a fraction of bulgeRadius; the tails that spill into the disc. */
  bulgeHaloSigma: number
  sizeMin: number
  sizeMax: number
  alpha: number
  /** Bulge instances pile up on one another, so they carry a fraction of `alpha`. */
  bulgeAlphaScale: number
  palette: Palette
}

export const GLOW_DEFAULTS: GlowParams = {
  count: 5000,
  radius: 4.5,
  thickness: 0.35,
  bulgeRadius: 0.55,
  bulgeFraction: 0.25,
  bulgeCoreShare: 0.4,
  bulgeCoreSigma: 0.3,
  bulgeHaloSigma: 1.4,
  sizeMin: 0.12,
  sizeMax: 0.36,
  alpha: 0.048,
  // vArm is 0 for bulge instances (e = 0), so bulge alpha is scaled by
  // (1 - GLOW_ARM) in the fragment shader; raised from 0.2 to compensate,
  // and the two-component bulge piles up less than the old single gaussian.
  bulgeAlphaScale: 0.5,
  palette: PALETTE,
}

export const GLOW_INTENSITY = 0.8

/** How much of the disc haze is confined to the arms (0 uniform, 1 arms only). */
export const GLOW_ARM = 0.85
/** Camera distance to the origin at which the haze is at full strength / attenuated to `min`. */
export const PROXIMITY = { far: 7.0, near: 5.5, min: 0.45 }

// Haze radial law, matching the star law in generate.ts: an exponent above 1
// piled sprites just outside the floor and clipped the inner disc, so this one
// sits below 1 and the haze thins gently toward the bulge.
const GLOW_FLOOR = 0.12
const GLOW_EXPONENT = 0.9

export function generateGlow(
  p: GlowParams,
  // Unused until arm crowding drives glow placement (Task 4).
  _model: ArmModel,
  rand: () => number = Math.random,
): BillboardBuffers {
  const b = allocBillboards(p.count)
  const gauss = makeGauss(rand)

  for (let i = 0; i < p.count; i++) {
    const inBulge = rand() < p.bulgeFraction
    let r: number
    let a: number
    let yy: number
    let color: [number, number, number]
    if (inBulge) {
      const sigma = rand() < p.bulgeCoreShare ? p.bulgeCoreSigma : p.bulgeHaloSigma
      const gx = gauss() * 2 * p.bulgeRadius * sigma
      const gz = gauss() * 2 * p.bulgeRadius * sigma
      r = Math.hypot(gx, gz)
      a = Math.atan2(gz, gx)
      yy = gauss() * 2 * p.bulgeRadius * sigma * 0.35
      color = p.palette[0]
    } else {
      r = (GLOW_FLOOR + (1 - GLOW_FLOOR) * Math.pow(rand(), GLOW_EXPONENT)) * p.radius
      const t = r / p.radius
      a = rand() * Math.PI * 2
      yy = gauss() * p.thickness * (1.0 - 0.6 * t)
      color = paletteAt(p.palette, t)
    }
    r = Math.min(1.2 * p.radius, r)
    b.ecc[i] = inBulge ? 0 : eccentricityAt(r)
    b.radius[i] = r
    b.angle[i] = a
    b.y[i] = yy
    b.size[i] = lerp(p.sizeMin, p.sizeMax, rand()) * (inBulge ? 1.5 : 1.0)
    b.rotation[i] = rand() * Math.PI * 2
    b.shape[i] = 0
    b.color[i * 3] = color[0]
    b.color[i * 3 + 1] = color[1]
    b.color[i * 3 + 2] = color[2]
    b.alpha[i] = p.alpha * (inBulge ? p.bulgeAlphaScale : 1.0) * (0.7 + 0.6 * rand())
  }
  return b
}

const glowFragment = /* glsl */ `
uniform float uIntensity;
uniform float uGlowArm;
uniform float uProximity;
uniform vec3 uProxLaw; // far, near, min
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vArm;

void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r2 = dot(d, d);
  float a = exp(-r2 * 3.0) * (1.0 - smoothstep(0.6, 1.0, r2));
  float arm = mix(1.0 - uGlowArm, 1.0, vArm);
  float prox = mix(uProxLaw.z, 1.0, smoothstep(uProxLaw.y, uProxLaw.x, uProximity));
  gl_FragColor = vec4(vColor * uIntensity, a * vAlpha * arm * prox);
}
`

export interface GlowLayer {
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  setTime(t: number): void
  /** Drawing-buffer pixels. */
  setViewport(width: number, height: number): void
  setFraction(fraction: number): void
  /** Camera distance to the origin; attenuates the haze as the camera closes in. */
  setProximity(distance: number): void
  dispose(): void
}

export function createGlow(
  model: ArmModel,
  width: number,
  height: number,
  overrides: Partial<GlowParams> = {},
  rand: () => number = Math.random,
): GlowLayer {
  const params = { ...GLOW_DEFAULTS, ...overrides }
  const uniforms = {
    ...billboardUniforms(width, height),
    uIntensity: { value: GLOW_INTENSITY },
    uGlowArm: { value: GLOW_ARM },
    uProximity: { value: PROXIMITY.far },
    uProxLaw: { value: new Vector3(PROXIMITY.far, PROXIMITY.near, PROXIMITY.min) },
  }
  const material = new ShaderMaterial({
    vertexShader: billboardVertex,
    fragmentShader: glowFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const geometry = createBillboardGeometry(generateGlow(params, model, rand), params.radius * 1.2)
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = RENDER_ORDER.glow

  return {
    mesh,
    setTime(t) {
      uniforms.uTime.value = t
    },
    setViewport(w, h) {
      uniforms.uViewport.value.set(w, h)
      uniforms.uMaxPx.value = h * 0.5
    },
    setFraction(fraction) {
      setInstanceFraction(geometry, fraction)
    },
    setProximity(distance) {
      uniforms.uProximity.value = distance
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
