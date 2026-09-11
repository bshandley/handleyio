import {
  AgXToneMapping,
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
// lifts only what exceeds 1.0, AgX rolls the core off to white without a
// hue skew, and a finish pass adds vignette and dither in sRGB space.

export type RenderPath = 'hdr' | 'direct'

export const EXPOSURE = 1.0
export const BLOOM = { strength: 0.6, radius: 0.4, threshold: 1.0 }
export const VIGNETTE = 0.35

export function hdrSupported(has: (name: string) => boolean): boolean {
  return has('EXT_color_buffer_float') || has('EXT_color_buffer_half_float')
}

export interface PostChain {
  path: RenderPath
  render(): void
  /** Width and height in CSS pixels; also applies the pixel ratio to the renderer. */
  setSize(width: number, height: number, pixelRatio: number): void
  setBloom(on: boolean): void
  dispose(): void
}

export const finishShader = {
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    uVignette: { value: VIGNETTE },
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
varying vec2 vUv;

void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 q = vUv - 0.5;
  c.rgb *= 1.0 - uVignette * dot(q, q) * 2.0;
  // interleaved gradient noise, half an LSB, breaks banding in the glow
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  c.rgb += (n - 0.5) / 255.0;
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
      dispose() {},
    }
  }

  renderer.toneMapping = AgXToneMapping
  renderer.toneMappingExposure = EXPOSURE

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
    dispose() {
      bloom.dispose()
      output.dispose()
      finish.dispose()
      composer.dispose()
    },
  }
}
