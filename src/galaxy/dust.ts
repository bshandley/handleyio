import {
  AddEquation,
  CanvasTexture,
  CustomBlending,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  OneFactor,
  ShaderMaterial,
  SrcColorFactor,
  Vector3,
  ZeroFactor,
} from 'three'
import type { ArmModel } from './arms'
import {
  allocBillboards,
  billboardUniforms,
  billboardVertex,
  createBillboardGeometry,
  setInstanceFraction,
  type BillboardBuffers,
} from './billboard'
import { clamp01, lerp, makeGauss } from './math'
import { renderCloudCell } from './noise'
import { RENDER_ORDER } from './order'

// Dust lanes. Instances hug the concave edge of each arm ridge plus a thin
// disc population, and multiply the framebuffer by a wavelength-dependent
// transmission (blue absorbed most), so lanes come out brown, not black.
// Drawn after the far-side stars and before the near-side ones (order.ts).

export interface DustParams {
  count: number
  radius: number
  thickness: number
  bulgeRadius: number
  /** World-unit offset of the lane from the ridge toward the concave side. */
  laneOffset: number
  /** Share of instances on lanes; the rest is a thin disc population. */
  laneFraction: number
  sizeMin: number
  sizeMax: number
}

export const DUST_DEFAULTS: DustParams = {
  count: 2500,
  radius: 4.5,
  thickness: 0.35,
  bulgeRadius: 0.55,
  laneOffset: 0.18,
  laneFraction: 0.7,
  sizeMin: 0.2,
  sizeMax: 0.6,
}

/** Multiplier on the atlas mask; 1 is fully opaque at a filament's densest point. */
export const DUST_ABSORB = 0.65
/** Per-channel absorption: red passes most, blue least, so lanes read brown. */
export const DUST_TINT: [number, number, number] = [0.55, 0.78, 1.0]

// Below this |sine of camera elevation| the dust has no effect at all.
export const FADE_START = 0.04
// At and above this |sine of camera elevation| the dust is at full strength.
export const FADE_FULL = 0.18

const ATLAS_CELLS = 4

/**
 * Fades dust absorption to zero near the galactic plane. The far/near star
 * split swaps at y = 0 in a single frame (setCameraSide); with dust at full
 * strength near the plane that swap darkens a different half of the stars
 * each side of the crossing and reads as a flash. Fading absorption out
 * before the crossing makes the swap invisible at the cost of the lanes
 * near edge-on views, which the y-split cannot render correctly anyway.
 */
export function dustFade(sinElevation: number): number {
  const t = clamp01((Math.abs(sinElevation) - FADE_START) / (FADE_FULL - FADE_START))
  return t * t * (3 - 2 * t)
}

export function generateDust(
  p: DustParams,
  model: ArmModel,
  rand: () => number = Math.random,
): BillboardBuffers {
  const b = allocBillboards(p.count)
  const gauss = makeGauss(rand)
  const arms = model.params.arms
  const inner = p.bulgeRadius * 1.6
  const outer = p.radius

  for (let i = 0; i < p.count; i++) {
    let r: number
    let a: number
    if (rand() < p.laneFraction) {
      r = inner + (outer - inner) * Math.pow(rand(), 1.2)
      a = model.laneAngle(i % arms, r, p.laneOffset) + gauss() * 0.06
    } else {
      r = Math.sqrt(lerp(inner * inner, outer * outer, rand()))
      a = rand() * Math.PI * 2
    }
    const t = r / p.radius
    b.radius[i] = r
    b.angle[i] = a
    b.y[i] = gauss() * p.thickness * 0.5 * (1 - 0.5 * t)
    b.size[i] = lerp(p.sizeMin, p.sizeMax, rand())
    b.rotation[i] = rand() * Math.PI * 2
    b.shape[i] = Math.floor(rand() * ATLAS_CELLS)
    b.color[i * 3] = 1
    b.color[i * 3 + 1] = 1
    b.color[i * 3 + 2] = 1
    b.alpha[i] = 0.5 + 0.5 * rand()
  }
  return b
}

/** 2x2 atlas of cloud cells; null outside a browser (tests). */
export function buildDustAtlas(cellSize = 128, seed = 1): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = cellSize * 2
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(cellSize * 2, cellSize * 2)
  for (let cell = 0; cell < ATLAS_CELLS; cell++) {
    const mask = renderCloudCell(cellSize, seed + cell)
    const ox = (cell % 2) * cellSize
    const oy = Math.floor(cell / 2) * cellSize
    for (let y = 0; y < cellSize; y++) {
      for (let x = 0; x < cellSize; x++) {
        const v = Math.round(mask[y * cellSize + x] * 255)
        const o = ((oy + y) * cellSize * 2 + ox + x) * 4
        image.data[o] = v
        image.data[o + 1] = v
        image.data[o + 2] = v
        image.data[o + 3] = 255
      }
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

const dustFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uAbsorb;
uniform vec3 uTint;
uniform float uFade;
varying vec2 vUv;
varying float vAlpha;
varying float vShape;

void main() {
  vec2 cell = vec2(mod(vShape, 2.0), floor(vShape / 2.0));
  float mask = texture2D(uAtlas, (vUv + cell) * 0.5).r;
  float a = mask * vAlpha * uAbsorb * uFade;
  // transmission per channel; the framebuffer is multiplied by this
  gl_FragColor = vec4(1.0 - a * uTint, 1.0);
}
`

export interface DustLayer {
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  setTime(t: number): void
  /** Drawing-buffer pixels. */
  setViewport(width: number, height: number): void
  setFraction(fraction: number): void
  setFade(fade: number): void
  dispose(): void
}

export function createDust(
  model: ArmModel,
  width: number,
  height: number,
  overrides: Partial<DustParams> = {},
  rand: () => number = Math.random,
): DustLayer {
  const params = { ...DUST_DEFAULTS, ...overrides }
  const atlas = buildDustAtlas()
  const uniforms = {
    ...billboardUniforms(width, height),
    uAtlas: { value: atlas },
    uAbsorb: { value: DUST_ABSORB },
    uTint: { value: new Vector3(...DUST_TINT) },
    uFade: { value: 1 },
  }
  const material = new ShaderMaterial({
    vertexShader: billboardVertex,
    fragmentShader: dustFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    // dst * src: the fragment outputs transmission, not light
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: ZeroFactor,
    blendDst: SrcColorFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
  })
  const geometry = createBillboardGeometry(generateDust(params, model, rand), params.radius * 1.2)
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = RENDER_ORDER.dust

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
    setFade(fade) {
      uniforms.uFade.value = fade
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      atlas?.dispose()
    },
  }
}
