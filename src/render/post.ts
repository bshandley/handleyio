import {
  AgXToneMapping,
  NeutralToneMapping,
  Vector2,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

// HDR chain: additive layers accumulate into a half-float target, bloom
// lifts only what exceeds 1.0, Neutral tone mapping preserves hue and
// saturation up the curve (AgX remains selectable through the ?tone pin),
// and a finish pass adds vignette and dither in sRGB space.

export type RenderPath = 'hdr' | 'direct'

export type ToneMapper = 'agx' | 'neutral'

/**
 * Shipped mapper. The 2026-09-12 spike chose Neutral: outer arms hold their
 * blue where AgX greys them out, and the core reads gold to pale rather than
 * brown (captures agx-085, neutral-085, agx-110, neutral-110).
 */
export const TONE_MAPPER: ToneMapper = 'neutral'
export const EXPOSURE = 0.85
/**
 * Star intensity, luminosity and armness together raised the peak fragment
 * radiance about tenfold over round one. The HDR path tone-maps that down,
 * but the direct (no-HDR) path renders straight to the screen buffer with
 * no tone mapper, so giants and the core clip flat to white. Scale the
 * galaxy and glow intensities by this factor on the direct path only.
 */
export const DIRECT_PATH_SCALE = 0.4
export const BLOOM = { strength: 0.3, radius: 0.6, threshold: 1.0 }
export const VIGNETTE = 0.35
/** Animated grain strength, in 8-bit LSBs at black. */
export const GRAIN = 1.5

/** Dev aid: `?tone=agx|neutral` pins the mapper for side-by-side captures. */
export function parseToneParam(search: string): ToneMapper | null {
  const raw = new URLSearchParams(search).get('tone')
  return raw === 'agx' || raw === 'neutral' ? raw : null
}

/** Dev aid: `?exposure=N` pins the exposure for captures; null unless finite and positive. */
export function parseExposureParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('exposure')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

export interface PostOptions {
  tone?: ToneMapper
  exposure?: number
}

export function hdrSupported(has: (name: string) => boolean): boolean {
  return has('EXT_color_buffer_float') || has('EXT_color_buffer_half_float')
}

export interface PostChain {
  path: RenderPath
  render(): void
  /** Width and height in CSS pixels; also applies the pixel ratio to the renderer. */
  setSize(width: number, height: number, pixelRatio: number): void
  setBloom(on: boolean): void
  /** Finish-pass clock; hold at 0 for static grain. */
  setTime(t: number): void
  dispose(): void
}

export const finishShader = {
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    uVignette: { value: VIGNETTE },
    uTime: { value: 0 },
    uGrain: { value: GRAIN },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uVignette;
uniform float uTime;
uniform float uGrain;
varying vec2 vUv;

void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 q = vUv - 0.5;
  c.rgb *= 1.0 - uVignette * dot(q, q) * 2.0;
  // interleaved gradient noise, half an LSB, breaks banding in the glow
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  c.rgb += (n - 0.5) / 255.0;
  // animated grain, strongest in the shadows, frozen when uTime is held at 0.
  // Interleaved gradient noise on a per-frame pixel offset: the classic
  // sin-based hash breaks into sweeping diagonal bands on Apple GPUs.
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec2 seed = gl_FragCoord.xy + floor(vec2(fract(uTime * 0.731) * 917.0, fract(uTime * 0.457) * 613.0));
  float g = fract(52.9829189 * fract(dot(seed, vec2(0.06711056, 0.00583715)))) - 0.5;
  c.rgb += g * (uGrain / 255.0) * (1.0 - luma);
  gl_FragColor = c;
}
`,
}

export function createPost(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  options: PostOptions = {},
): PostChain {
  if (!hdrSupported((name) => renderer.extensions.has(name))) {
    return {
      path: 'direct',
      render: () => renderer.render(scene, camera),
      setSize(w, h, pixelRatio) {
        renderer.setPixelRatio(pixelRatio)
        renderer.setSize(w, h)
      },
      setBloom() {},
      setTime() {},
      dispose() {},
    }
  }

  renderer.toneMapping = (options.tone ?? TONE_MAPPER) === 'neutral' ? NeutralToneMapping : AgXToneMapping
  renderer.toneMappingExposure = options.exposure ?? EXPOSURE

  const composer = new EffectComposer(renderer)
  const bloom = new UnrealBloomPass(
    new Vector2(width, height),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold,
  )
  const output = new OutputPass()
  const finish = new ShaderPass(finishShader)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(bloom)
  composer.addPass(output)
  composer.addPass(finish)

  return {
    path: 'hdr',
    render: () => composer.render(),
    setSize(w, h, pixelRatio) {
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(w, h)
      composer.setPixelRatio(pixelRatio)
      composer.setSize(w, h)
    },
    setBloom(on) {
      bloom.enabled = on
    },
    setTime(t) {
      finish.uniforms.uTime.value = t
    },
    dispose() {
      bloom.dispose()
      output.dispose()
      finish.dispose()
      composer.dispose()
    },
  }
}
