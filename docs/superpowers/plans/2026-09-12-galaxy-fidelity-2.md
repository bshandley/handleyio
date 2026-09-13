# Galaxy Fidelity Round Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace material arms with a density-wave orbit model, give resolved stars a luminosity function, fix arm colour and the bulge under the tone mapper, clamp the camera off the plane, refine dust, rebuild beacons as in-scene stars, and polish background, finish pass, and HUD.

**Architecture:** One shared GLSL orbit chunk places every galaxy instance on a tilted ellipse (semi-major axis, phase, eccentricity per instance; spin, wobble, pattern speed as uniforms) and exposes an "armness" signal that stars, glow, and dust use to concentrate light and absorption in the arms. A pure TypeScript mirror (`src/galaxy/orbit.ts`) computes the same curve on the CPU for beacons and tests. Everything else (layers, post chain, ladder, HUD) keeps its round-one shape and gains the changes listed per task.

**Tech Stack:** Vite, vanilla TypeScript, Three.js 0.184 (`NeutralToneMapping`, `AgXToneMapping`, EffectComposer chain from `three/addons`), Vitest, Playwright. No new dependencies.

**Spec:** docs/superpowers/specs/2026-09-12-galaxy-fidelity-2-design.md

## Global Constraints

- No em dashes anywhere (code, comments, commits, docs).
- The render loop allows zero per-frame allocations (repo CLAUDE.md). Per-frame work this plan adds: scalar uniform writes (glow proximity, finish time, beacon time) and five HUD tag transform writes that happen only when a rounded screen position changes. Each HUD tag keeps its own `ScreenPos` scratch object (written by `toScreenInto`), and beacons.ts walks a plain `orbitList` array snapshotted from the lookup Map at init, so neither loop allocates (whole-branch review, Important).
- The orbit curve lives in three places and must stay identical: `ORBIT` constants and functions in `src/galaxy/orbit.ts`, the GLSL `orbitChunk` in `src/galaxy/shaders.ts`, and nowhere else (beacons and generators import `orbit.ts`). A unit test transcribes the GLSL into TypeScript and compares.
- The no-WebGL fallback HTML in index.html is untouched.
- Node registry positions are data (world positions at t = 0); galaxy and HUD code never special-case nodes.
- Colours in generated buffers stay in [0, 1]; brightness is `aLum` times an intensity uniform.
- Every task: tests first, `npm test` green, `npm run build` green, commit. Commit messages end with the attribution lines given in the session's system reminder.
- This plan mirrors the code. When a value is tuned by eye in Task 12, update the constants table there.

**Design notes locked during planning:**

- Attribute names `aRadius` and `aAngle` are kept across every layer; they now mean semi-major axis and orbital phase. Renaming them to `aA`/`aPhase` as the spec sketched would touch every generator, geometry builder, and test for no behavioural gain. Record as a deviation in Task 12.
- Per-instance tilt offset is an attribute (`aTilt`, in `BillboardBuffers.tilt`), not a material uniform: the dust layer mixes lane instances (offset toward the concave side) and dark clumps (offset 0) in one draw call.
- `orbitPosition` takes the tilt offset as its last argument; the star shader passes `0.0`.
- The armness peak sits on the ellipse major axis (`cos(2 (psi - tilt))`). A tunable `uArmShift` radians offsets it if the crowding caustic turns out to sit off the apsides on hardware.
- Pattern speed starts at 0.02 rad/s (one pattern turn in about 314 s; corotation near a = 4.1, so most of the disc overtakes the arms). Tunable in Task 12.
- `orbitalSpeed()` moves to `orbit.ts` as `omega()`; `generate.ts` re-exports `orbitalSpeed` until Task 6 retires the last importer, then the re-export goes.
- `dustFade` and its constants stay (safety net); the camera clamp keeps `|sin(elevation)|` at or above cos(78 deg) = 0.208, above `FADE_FULL` (0.18), so it never engages in normal use.
- Sim time starts at 0 (`elapsed = 0` in scene.ts). The 160 s pre-wind goes with the material arms.

**Task ordering:** tone spike, orbit mirror, orbit chunk and buffers, stars, glow and bulge, dust, beacons, camera, background, finish grain, HUD, tune and ship. The tone spike lands first so every later layer is judged under the mapper that ships.

---

### Task 1: Tone mapping spike and `?tone=` pin

**Files:**
- Modify: `src/render/post.ts`
- Create: `scripts/capture-look.mjs`
- Test: `tests/post.test.ts`

**Interfaces:**
- Produces: `type ToneMapper = 'agx' | 'neutral'`; `TONE_MAPPER: ToneMapper` (the shipped default); `parseToneParam(search: string): ToneMapper | null`; `parseExposureParam(search: string): number | null`; `createPost(renderer, scene, camera, width, height, options?: { tone?: ToneMapper; exposure?: number })`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/post.test.ts`:

```ts
import { parseExposureParam, parseToneParam, TONE_MAPPER } from '../src/render/post'

describe('tone pin', () => {
  it('parses the tone mapper name and ignores anything else', () => {
    expect(parseToneParam('?tone=neutral')).toBe('neutral')
    expect(parseToneParam('?tone=agx')).toBe('agx')
    expect(parseToneParam('?tone=filmic')).toBeNull()
    expect(parseToneParam('')).toBeNull()
  })

  it('parses a finite positive exposure', () => {
    expect(parseExposureParam('?exposure=1.2')).toBe(1.2)
    expect(parseExposureParam('?exposure=0')).toBeNull()
    expect(parseExposureParam('?exposure=abc')).toBeNull()
    expect(parseExposureParam('?level=0')).toBeNull()
  })

  it('ships one of the two mappers', () => {
    expect(['agx', 'neutral']).toContain(TONE_MAPPER)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/post.test.ts`
Expected: FAIL, `parseToneParam` is not exported.

- [ ] **Step 3: Implement the pin and the option**

In `src/render/post.ts`, add to the imports from `'three'`: `NeutralToneMapping`. Replace the constants block and `createPost` signature:

```ts
export type ToneMapper = 'agx' | 'neutral'

/** Shipped mapper. Task 1's spike decides it; Task 12's table records why. */
export const TONE_MAPPER: ToneMapper = 'agx'
export const EXPOSURE = 0.85
export const BLOOM = { strength: 0.3, radius: 0.6, threshold: 1.0 }
export const VIGNETTE = 0.35

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
```

Change the `createPost` signature to `(renderer, scene, camera, width, height, options: PostOptions = {})` and replace the two renderer lines inside the HDR branch:

```ts
  renderer.toneMapping = (options.tone ?? TONE_MAPPER) === 'neutral' ? NeutralToneMapping : AgXToneMapping
  renderer.toneMappingExposure = options.exposure ?? EXPOSURE
```

In `src/scene.ts`, import `parseExposureParam, parseToneParam` from `'./render/post'` and change the `createPost` call:

```ts
  const post = createPost(renderer, scene, camera, innerWidth, innerHeight, {
    tone: parseToneParam(location.search) ?? undefined,
    exposure: parseExposureParam(location.search) ?? undefined,
  })
```

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run tests/post.test.ts && npm run build`
Expected: PASS, build green.

- [ ] **Step 5: Write the capture script**

Create `scripts/capture-look.mjs`:

```js
// Tuning aid: capture the level-0 scene at a fixed camera for side-by-side
// comparisons. Usage (preview server on 4173):
//   node scripts/capture-look.mjs out/agx.png "tone=agx&exposure=0.85"
//   node scripts/capture-look.mjs out/neutral.png "tone=neutral&exposure=1.0"
// A third argument "zoom" dollies to the closest allowed distance first.
import { chromium } from '@playwright/test'

const [, , out = 'look.png', params = '', pose = ''] = process.argv
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }))
await page.goto(`http://localhost:4173/?level=0&${params}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
if (pose === 'zoom') {
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(2500)
}
await page.screenshot({ path: out })
await browser.close()
console.log(`wrote ${out}`)
```

- [ ] **Step 6: Run the spike**

```bash
npm run build && (npx vite preview --port 4173 --strictPort &) && sleep 2
mkdir -p /tmp/look
node scripts/capture-look.mjs /tmp/look/agx-085.png "tone=agx&exposure=0.85"
node scripts/capture-look.mjs /tmp/look/neutral-085.png "tone=neutral&exposure=0.85"
node scripts/capture-look.mjs /tmp/look/neutral-110.png "tone=neutral&exposure=1.1"
node scripts/capture-look.mjs /tmp/look/agx-110.png "tone=agx&exposure=1.1"
```

Look at the four captures (Read tool). Decision criterion from the spec: outer arms hold their blue past t of about 0.6, and the core rolls gold to white without a hue skew or a clipped plateau. If Neutral passes, set `TONE_MAPPER = 'neutral'` and `EXPOSURE` to the winning value. If Neutral clips the core to a flat plateau, keep `'agx'`; Task 4 and Task 5 then lower `GLOW_INTENSITY` and `STAR_INTENSITY` so the arms sit below the shoulder. Record the decision and the capture file names in Task 12's table under `TONE_MAPPER`.

Note: the winning look is judged again once the new star and glow layers land (Tasks 4 and 5); this spike sets the starting point, not the final answer.

- [ ] **Step 7: Commit**

```bash
git add src/render/post.ts src/scene.ts scripts/capture-look.mjs tests/post.test.ts
git commit -m "feat: tone mapper spike, ?tone and ?exposure capture pins"
```

---

### Task 2: Orbit model in TypeScript

**Files:**
- Create: `src/galaxy/orbit.ts`
- Modify: `src/galaxy/generate.ts` (re-export `orbitalSpeed` from orbit.ts)
- Test: `tests/orbit.test.ts`

**Interfaces:**
- Produces: `OrbitParams { spin, wobble, pattern, eInner, eFalloff, radius }`; `ORBIT: OrbitParams`; `omega(a)`; `tilt(a, t, p?)`; `eccentricityAt(a, p?)`; `Elements { a, phase, y, ecc }`; `orbitPosition(e: Elements, t, out: Vector3, p?, tiltOffset = 0): Vector3`; `solveElements(x, y, z, t, p?): Elements`; `orbitalSpeed` (alias of `omega`).

- [ ] **Step 1: Write the failing tests**

Create `tests/orbit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  eccentricityAt,
  omega,
  ORBIT,
  orbitPosition,
  solveElements,
  tilt,
} from '../src/galaxy/orbit'

describe('orbit model', () => {
  it('keeps the round-one rotation curve', () => {
    expect(omega(0)).toBeCloseTo(0.0875 / 0.3, 9)
    expect(omega(2)).toBeCloseTo(0.0875 / 2.3, 9)
  })

  it('tilt advances by spin per unit a and by pattern per second', () => {
    const p = { ...ORBIT, wobble: 0 }
    expect(tilt(2, 0, p) - tilt(1, 0, p)).toBeCloseTo(p.spin, 9)
    expect(tilt(1, 10, p) - tilt(1, 0, p)).toBeCloseTo(p.pattern * 10, 9)
  })

  it('eccentricity falls from eInner at the centre to eInner (1 - eFalloff) at the edge', () => {
    expect(eccentricityAt(0)).toBeCloseTo(ORBIT.eInner, 9)
    expect(eccentricityAt(ORBIT.radius)).toBeCloseTo(ORBIT.eInner * (1 - ORBIT.eFalloff), 9)
    expect(eccentricityAt(ORBIT.radius * 3)).toBeCloseTo(ORBIT.eInner * (1 - ORBIT.eFalloff), 9)
  })

  it('a circular orbit with no tilt is the round-one circle', () => {
    const p = { ...ORBIT, spin: 0, wobble: 0, pattern: 0 }
    const out = new Vector3()
    orbitPosition({ a: 2, phase: 0.3, y: 0.1, ecc: 0 }, 7, out, p)
    const angle = 0.3 + omega(2) * 7
    expect(out.x).toBeCloseTo(2 * Math.cos(angle), 9)
    expect(out.z).toBeCloseTo(2 * Math.sin(angle), 9)
    expect(out.y).toBeCloseTo(0.1, 9)
  })

  it('an eccentric orbit stays between a (1 - e) and a from the centre', () => {
    const out = new Vector3()
    for (let t = 0; t < 600; t += 7) {
      orbitPosition({ a: 3, phase: 1.1, y: 0, ecc: 0.3 }, t, out)
      const r = Math.hypot(out.x, out.z)
      expect(r).toBeGreaterThanOrEqual(3 * 0.7 - 1e-9)
      expect(r).toBeLessThanOrEqual(3 + 1e-9)
    }
  })

  it('a tilt offset rotates the whole ellipse', () => {
    const a = new Vector3()
    const b = new Vector3()
    orbitPosition({ a: 2.5, phase: 0.4, y: 0, ecc: 0.2 }, 3, a, ORBIT, 0)
    orbitPosition({ a: 2.5, phase: 0.4, y: 0, ecc: 0.2 }, 3, b, ORBIT, 0.5)
    const ra = Math.atan2(a.z, a.x)
    const rb = Math.atan2(b.z, b.x)
    const d = Math.atan2(Math.sin(rb - ra), Math.cos(rb - ra))
    expect(d).toBeCloseTo(0.5, 9)
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(Math.hypot(a.x, a.z), 9)
  })

  it('solveElements round-trips registry-style positions at t = 0', () => {
    const out = new Vector3()
    for (const [x, y, z] of [
      [2.8, 0.25, 0.6],
      [-1.9, -0.15, 2.4],
      [-0.8, 0.3, -3.0],
      [1.8, -0.2, -1.9],
      [-3.2, 0.15, -0.8],
    ]) {
      const e = solveElements(x, y, z, 0)
      expect(e.ecc).toBeCloseTo(eccentricityAt(e.a), 9)
      orbitPosition(e, 0, out)
      expect(out.x).toBeCloseTo(x, 4)
      expect(out.y).toBeCloseTo(y, 9)
      expect(out.z).toBeCloseTo(z, 4)
    }
  })

  it('solveElements round-trips at a later time too', () => {
    const out = new Vector3()
    const e = solveElements(1.5, 0, -2.0, 42)
    orbitPosition(e, 42, out)
    expect(out.x).toBeCloseTo(1.5, 4)
    expect(out.z).toBeCloseTo(-2.0, 4)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/orbit.test.ts`
Expected: FAIL, cannot resolve `../src/galaxy/orbit`.

- [ ] **Step 3: Implement orbit.ts**

Create `src/galaxy/orbit.ts`:

```ts
import type { Vector3 } from 'three'

// Density-wave orbit model. Every galaxy instance moves on an ellipse whose
// tilt advances with its semi-major axis, so ellipses crowd along a two-armed
// spiral that turns rigidly at the pattern speed while stars stream through
// it. The GLSL orbitChunk in shaders.ts inlines the same math and constants;
// keep them identical (tests/orbit.test.ts transcribes the chunk).

export interface OrbitParams {
  /** Tilt advance per world unit of semi-major axis (radians). */
  spin: number
  /** Sinusoidal tilt perturbation amplitude (radians). */
  wobble: number
  /** Pattern angular speed (radians per second). */
  pattern: number
  /** Eccentricity at the centre. */
  eInner: number
  /** Fraction of eInner lost by t = a / radius = 1. */
  eFalloff: number
  /** Nominal disc radius the eccentricity law is scaled to. */
  radius: number
}

export const ORBIT: OrbitParams = {
  spin: 0.95,
  wobble: 0.1,
  pattern: 0.02,
  eInner: 0.35,
  eFalloff: 0.5,
  radius: 4.5,
}

export interface Elements {
  /** Semi-major axis (world units). */
  a: number
  /** Orbital phase at t = 0 (radians). */
  phase: number
  y: number
  ecc: number
}

/** Angular speed on the round-one rotation curve. */
export function omega(a: number): number {
  return 0.0875 / (0.3 + a)
}

/** Alias kept for round-one call sites. */
export const orbitalSpeed = omega

export function tilt(a: number, t: number, p: OrbitParams = ORBIT): number {
  return p.spin * a + p.wobble * Math.sin(a * 3.1) + p.pattern * t
}

export function eccentricityAt(a: number, p: OrbitParams = ORBIT): number {
  const t = Math.min(1, a / p.radius)
  return p.eInner * (1 - p.eFalloff * t)
}

/** World position at time t; writes `out` and returns it (no allocation). */
export function orbitPosition(
  e: Elements,
  t: number,
  out: Vector3,
  p: OrbitParams = ORBIT,
  tiltOffset = 0,
): Vector3 {
  const phi = e.phase + omega(e.a) * t
  const th = tilt(e.a, t, p) + tiltOffset
  const lx = e.a * Math.cos(phi)
  const lz = e.a * (1 - e.ecc) * Math.sin(phi)
  const c = Math.cos(th)
  const s = Math.sin(th)
  return out.set(c * lx - s * lz, e.y, s * lx + c * lz)
}

/**
 * Inverse: elements whose orbit passes through (x, y, z) at time t, with the
 * eccentricity law applied. Fixed-point iteration on a: the tilt varies
 * slowly with a, so a dozen steps converge to well under 1e-6.
 */
export function solveElements(
  x: number,
  y: number,
  z: number,
  t: number,
  p: OrbitParams = ORBIT,
): Elements {
  let a = Math.hypot(x, z)
  let lx = x
  let lz = z
  let ecc = eccentricityAt(a, p)
  for (let i = 0; i < 16; i++) {
    const th = tilt(a, t, p)
    const c = Math.cos(th)
    const s = Math.sin(th)
    lx = c * x + s * z
    lz = -s * x + c * z
    ecc = eccentricityAt(a, p)
    a = Math.hypot(lx, lz / (1 - ecc))
  }
  const phase = Math.atan2(lz / (1 - ecc), lx) - omega(a) * t
  return { a, phase, y, ecc }
}
```

In `src/galaxy/generate.ts`, delete the `orbitalSpeed` function (and its comment) and add near the top:

```ts
export { orbitalSpeed } from './orbit'
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/orbit.test.ts tests/beacons.test.ts && npm run build`
Expected: PASS (beacons still import `orbitalSpeed` from generate.ts through the re-export), build green.

- [ ] **Step 5: Commit**

```bash
git add src/galaxy/orbit.ts src/galaxy/generate.ts tests/orbit.test.ts
git commit -m "feat: density-wave orbit model in TypeScript with inverse solver"
```

---

### Task 3: Orbit chunk, billboard buffers, arm model on the new curve

Every layer switches to the ellipse chunk in this task with eccentricity 0 and no armness use, so the scene renders exactly as before (circular orbits) and later tasks turn the new levers on one layer at a time.

**Files:**
- Modify: `src/galaxy/shaders.ts` (replace `orbitChunk`; star vertex passes the new arguments)
- Modify: `src/galaxy/billboard.ts` (`ecc`, `tilt` buffers and attributes; `orbitUniforms` merged into `billboardUniforms`; `vArm` varying; `uAlign` tangent alignment)
- Modify: `src/galaxy/arms.ts` (ridge is the tilt; spurs, `sample`, `laneAngle` retired)
- Modify: `src/galaxy/galaxy.ts` (orbit uniforms, `aEcc` attribute)
- Modify: `src/galaxy/generate.ts` (`ecc` buffer, zero for now; placement no longer calls `model.sample`)
- Modify: `src/galaxy/glow.ts`, `src/galaxy/dust.ts` (placement no longer calls `model.sample` / `laneAngle`)
- Modify: `src/galaxy/deepfield.ts` (pattern speed 0)
- Modify: `src/scene.ts` (`elapsed = 0`)
- Test: `tests/arms.test.ts`, `tests/billboard.test.ts`, `tests/orbit.test.ts` (GLSL transcription), `tests/generate.test.ts`, `tests/dust.test.ts`

**Interfaces:**
- Consumes: `ORBIT`, `omega`, `tilt`, `orbitPosition` from Task 2.
- Produces: GLSL functions `orbitOmega(a)`, `orbitTilt(a, offset)`, `orbitPosition(a, phase0, y, ecc, tiltOffset)`, `orbitTangent(a, phase0, ecc, tiltOffset)`, `orbitArmness(world, a, ecc, tiltOffset)`; uniforms `uTime`, `uOrbit`, `uSpin`, `uWobble`, `uPattern`, `uArmPower`, `uArmShift`; `orbitUniforms()` returning `{ uTime, uOrbit, uSpin, uWobble, uPattern, uArmPower, uArmShift }`; `BillboardBuffers` gains `ecc: Float32Array` and `tilt: Float32Array`; billboard attributes `aEcc`, `aTilt`; billboard uniform `uAlign`; varying `vArm`; `ArmModel { params, ridgeAngle(arm, a) }` with `ArmParams { arms, spin, wobble }`.

- [ ] **Step 1: Write the failing tests**

Replace `tests/arms.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { ORBIT, tilt } from '../src/galaxy/orbit'

describe('arm model', () => {
  it('ridge angle is the orbit tilt at t = 0 plus the arm offset', () => {
    const m = createArmModel()
    expect(m.ridgeAngle(0, 2)).toBeCloseTo(tilt(2, 0, ORBIT), 9)
    expect(m.ridgeAngle(1, 2)).toBeCloseTo(tilt(2, 0, ORBIT) + Math.PI, 9)
  })

  it('advances the ridge by spin per unit radius with wobble off', () => {
    const m = createArmModel({ ...ARM_DEFAULTS, wobble: 0 })
    expect(m.ridgeAngle(0, 3) - m.ridgeAngle(0, 2)).toBeCloseTo(ARM_DEFAULTS.spin, 9)
  })

  it('defaults share the orbit constants so the CPU ridge matches the GPU tilt', () => {
    expect(ARM_DEFAULTS.spin).toBe(ORBIT.spin)
    expect(ARM_DEFAULTS.wobble).toBe(ORBIT.wobble)
    expect(ARM_DEFAULTS.arms).toBe(2)
  })
})
```

Append to `tests/billboard.test.ts` inside the describe:

```ts
  it('carries eccentricity and tilt per instance', () => {
    expect(buffers.ecc).toHaveLength(10)
    expect(buffers.tilt).toHaveLength(10)
    expect(geometry.attributes.aEcc.count).toBe(10)
    expect(geometry.attributes.aTilt.count).toBe(10)
  })

  it('vertex shader takes the ellipse arguments and can align to the orbit tangent', () => {
    expect(billboardVertex).toContain('orbitPosition(aRadius, aAngle, aY, aEcc, aTilt)')
    expect(billboardVertex).toContain('orbitTangent(')
    expect(billboardVertex).toContain('uAlign')
    expect(billboardVertex).toContain('vArm')
  })

  it('uniform set carries the orbit constants', () => {
    const u = billboardUniforms(800, 600)
    expect(u.uSpin.value).toBe(0.95)
    expect(u.uPattern.value).toBeGreaterThan(0)
    expect(u.uAlign.value).toBe(0)
  })
```

Append to `tests/orbit.test.ts`:

```ts
import { orbitChunk } from '../src/galaxy/shaders'

describe('GLSL orbit chunk', () => {
  // Hand transcription of orbitChunk. If this drifts from the GLSL, the
  // beacons (CPU) and the stars (GPU) part ways on screen.
  function glsl(a: number, phase0: number, y: number, ecc: number, tiltOffset: number, uTime: number) {
    const uSpin = ORBIT.spin
    const uWobble = ORBIT.wobble
    const uPattern = ORBIT.pattern
    const uOrbit = 1
    const orbitOmega = (a: number) => 0.0875 / (0.3 + a)
    const orbitTilt = (a: number, offset: number) =>
      uSpin * a + uWobble * Math.sin(a * 3.1) + uPattern * uTime + offset
    const phi = phase0 + orbitOmega(a) * uTime * uOrbit
    const th = orbitTilt(a, tiltOffset)
    const lx = a * Math.cos(phi)
    const lz = a * (1.0 - ecc) * Math.sin(phi)
    const c = Math.cos(th)
    const s = Math.sin(th)
    return [c * lx - s * lz, y, s * lx + c * lz]
  }

  it('matches orbitPosition for a handful of elements', () => {
    const out = new Vector3()
    for (const [a, phase, y, ecc, off, t] of [
      [1, 0, 0, 0, 0, 0],
      [2.5, 1.2, 0.1, 0.3, 0, 33],
      [4, -2, -0.2, 0.15, -0.25, 210],
      [0.4, 3, 0.05, 0, 0, 900],
    ]) {
      orbitPosition({ a, phase, y, ecc }, t, out, ORBIT, off)
      const [x, yy, z] = glsl(a, phase, y, ecc, off, t)
      expect(out.x).toBeCloseTo(x, 9)
      expect(out.y).toBeCloseTo(yy, 9)
      expect(out.z).toBeCloseTo(z, 9)
    }
  })

  it('inlines the same curve constants as orbit.ts', () => {
    expect(orbitChunk).toContain('0.0875 / (0.3 + a)')
    expect(orbitChunk).toContain('sin(a * 3.1)')
  })
})
```

In `tests/generate.test.ts`, add inside the first describe:

```ts
  it('carries a per-star eccentricity buffer', () => {
    expect(g.ecc).toHaveLength(5000)
  })
```

In `tests/dust.test.ts`, delete the test `'puts most instances on the arm lanes'` (its `laneAngle` contract is retired here; Task 6 adds the ellipse-based lane test) and add:

```ts
  it('carries a per-instance tilt buffer', () => {
    expect(d.tilt).toHaveLength(2000)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/arms.test.ts tests/billboard.test.ts tests/orbit.test.ts tests/generate.test.ts tests/dust.test.ts`
Expected: FAIL on the new assertions (`ecc`, `tilt`, `orbitTangent`, `uSpin`, the arm-model shape).

- [ ] **Step 3: Rewrite the orbit chunk**

In `src/galaxy/shaders.ts`, replace `orbitChunk`:

```ts
// Shared GLSL chunk. Mirrors src/galaxy/orbit.ts (beacons orbit with it on
// the CPU); keep the math and constants identical. Every instance rides a
// tilted ellipse: semi-major axis a, phase, eccentricity, plus a per-instance
// tilt offset (dust lanes sit on the concave side of the star ridge).
export const orbitChunk = /* glsl */ `
uniform float uTime;
uniform float uOrbit;
uniform float uSpin;
uniform float uWobble;
uniform float uPattern;
uniform float uArmPower;
uniform float uArmShift;

float orbitOmega(float a) {
  return 0.0875 / (0.3 + a);
}

float orbitTilt(float a, float offset) {
  return uSpin * a + uWobble * sin(a * 3.1) + uPattern * uTime + offset;
}

vec3 orbitPosition(float a, float phase0, float y, float ecc, float tiltOffset) {
  float phi = phase0 + orbitOmega(a) * uTime * uOrbit;
  float th = orbitTilt(a, tiltOffset);
  vec2 l = vec2(a * cos(phi), a * (1.0 - ecc) * sin(phi));
  float c = cos(th);
  float s = sin(th);
  return vec3(c * l.x - s * l.y, y, s * l.x + c * l.y);
}

// Direction of motion in world space (unnormalised), for aligning sprites.
vec3 orbitTangent(float a, float phase0, float ecc, float tiltOffset) {
  float phi = phase0 + orbitOmega(a) * uTime * uOrbit;
  float th = orbitTilt(a, tiltOffset);
  vec2 d = vec2(-a * sin(phi), a * (1.0 - ecc) * cos(phi));
  float c = cos(th);
  float s = sin(th);
  return vec3(c * d.x - s * d.y, 0.0, s * d.x + c * d.y);
}

// 1 on the arm ridge (ellipse major axis), 0 between arms. Circular
// instances (bulge, e = 0) have no ridge and return 0.
float orbitArmness(vec3 world, float a, float ecc, float tiltOffset) {
  if (ecc < 0.001) return 0.0;
  float psi = atan(world.z, world.x);
  float w = 0.5 + 0.5 * cos(2.0 * (psi - orbitTilt(a, tiltOffset) - uArmShift));
  return pow(w, uArmPower);
}
`
```

Update the star vertex shader in the same file: add `attribute float aEcc;` after `aSpike`, and change the placement line to

```glsl
  vec3 world = orbitPosition(aRadius, aAngle, aY, aEcc, 0.0);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
```

Add to the same file, after the chunk, the shared uniform factory:

```ts
import { ORBIT } from './orbit'

/** Uniforms the orbit chunk needs; every orbiting material spreads these in. */
export function orbitUniforms() {
  return {
    uTime: { value: 0 },
    uOrbit: { value: 1 },
    uSpin: { value: ORBIT.spin },
    uWobble: { value: ORBIT.wobble },
    uPattern: { value: ORBIT.pattern },
    uArmPower: { value: ARM_POWER },
    uArmShift: { value: ARM_SHIFT },
  }
}

/** Sharpness of the armness peak; higher confines light to a narrower ridge. */
export const ARM_POWER = 3.0
/** Angular offset of the armness peak from the ellipse major axis (radians). */
export const ARM_SHIFT = 0.0
```

(Put the `import` at the top of the file with the other imports; the two constants above the factory.)

- [ ] **Step 4: Billboard buffers and vertex**

In `src/galaxy/billboard.ts`:

Add to `BillboardBuffers`:

```ts
  /** Orbital eccentricity; 0 is circular. */
  ecc: Float32Array
  /** Per-instance tilt offset (radians); dust lanes use a negative value. */
  tilt: Float32Array
```

Add to `allocBillboards`: `ecc: new Float32Array(count),` and `tilt: new Float32Array(count),`.

Add to `createBillboardGeometry` after `aShape`:

```ts
  geometry.setAttribute('aEcc', new InstancedBufferAttribute(b.ecc, 1))
  geometry.setAttribute('aTilt', new InstancedBufferAttribute(b.tilt, 1))
```

Replace `billboardUniforms`:

```ts
import { orbitChunk, orbitUniforms } from './shaders'

/** Uniforms every billboard material shares. Viewport is in drawing-buffer pixels. */
export function billboardUniforms(width: number, height: number) {
  return {
    ...orbitUniforms(),
    uViewport: { value: new Vector2(width, height) },
    // no sprite wider than half the viewport, however close the camera gets
    uMaxPx: { value: height * 0.5 },
    // sprites fade out inside this camera distance so the disc never fills the screen
    uNearFade: { value: 1.5 },
    // 1: quads rotate to lie along the orbit tangent (dust filaments); 0: aRotation only
    uAlign: { value: 0 },
  }
}
```

Replace the vertex shader body:

```ts
export const billboardVertex =
  orbitChunk +
  /* glsl */ `
uniform vec2 uViewport;
uniform float uMaxPx;
uniform float uNearFade;
uniform float uAlign;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute float aRotation;
attribute float aShape;
attribute float aAlpha;
attribute float aEcc;
attribute float aTilt;
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vArm;

void main() {
  vec3 world = orbitPosition(aRadius, aAngle, aY, aEcc, aTilt);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float dist = max(0.001, -mv.z);
  // pixels per world unit at this depth: half the viewport height times cot(fov/2)
  float pxPerUnit = 0.5 * uViewport.y * projectionMatrix[1][1] / dist;
  float size = min(aSize, uMaxPx / pxPerUnit);
  float rot = aRotation;
  if (uAlign > 0.5) {
    vec3 tangent = (modelViewMatrix * vec4(orbitTangent(aRadius, aAngle, aEcc, aTilt), 0.0)).xyz;
    rot += atan(tangent.y, tangent.x);
  }
  float c = cos(rot);
  float s = sin(rot);
  vec2 corner = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  mv.xy += corner * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vColor = aColor;
  vAlpha = aAlpha * smoothstep(uNearFade * 0.5, uNearFade, dist);
  vShape = aShape;
  vArm = orbitArmness(world, aRadius, aEcc, aTilt);
}
`
```

- [ ] **Step 5: Arm model**

Replace `src/galaxy/arms.ts`:

```ts
import { ORBIT, tilt } from './orbit'

// The arm ridge is the line of apsides of the density-wave ellipses
// (orbit.ts): arm k at semi-major axis a lies along tilt(a) + k * PI. This
// is the CPU description of where the GPU crowds the light; generators use
// it to seed clusters on the arms.

export interface ArmParams {
  arms: number
  /** Ridge angle advance per world unit of a (radians). Mirrors ORBIT.spin. */
  spin: number
  /** Sinusoidal ridge perturbation amplitude (radians). Mirrors ORBIT.wobble. */
  wobble: number
}

export const ARM_DEFAULTS: ArmParams = {
  arms: 2,
  spin: ORBIT.spin,
  wobble: ORBIT.wobble,
}

export interface ArmModel {
  params: ArmParams
  /** Ridge angle of `arm` at semi-major axis a, at t = 0. */
  ridgeAngle(arm: number, a: number): number
}

export function createArmModel(p: ArmParams = ARM_DEFAULTS): ArmModel {
  const orbit = { ...ORBIT, spin: p.spin, wobble: p.wobble }
  return {
    params: p,
    ridgeAngle: (arm, a) => tilt(a, 0, orbit) + (arm / p.arms) * Math.PI * 2,
  }
}
```

`createArmModel` no longer takes an rng. Update `src/scene.ts` (`createArmModel()` already has no arguments) and every test that passed `mulberry(...)` as a second argument: `tests/generate.test.ts`, `tests/glow.test.ts`, `tests/dust.test.ts`, `tests/galaxy.test.ts` (change `createArmModel(ARM_DEFAULTS, mulberry(1))` to `createArmModel()`).

- [ ] **Step 6: Generators on the new placement (circular for now)**

`src/galaxy/generate.ts`: add `ecc: Float32Array` to `GalaxyBuffers` (documented "orbital eccentricity, 0 circular"); allocate `const ecc = new Float32Array(n)` (left at 0 in this task); in the arm branch replace `a = model.sample(i % arms, r, t, rand, gauss)` with `a = rand() * Math.PI * 2` (uniform phase; the arms come from crowding once Task 4 sets eccentricities). Include `ecc` in the `sortByY` input and output (`ecc: permute(b.ecc)`), and in the `Omit` type. Clusters keep using `model.ridgeAngle`.

`src/galaxy/glow.ts`: replace `a = model.sample(i % arms, r, t, rand, gauss)` with `a = rand() * Math.PI * 2`; remove the now-unused `arms` local. Spread `billboardUniforms` already; nothing else changes here.

`src/galaxy/dust.ts`: replace the lane branch `a = model.laneAngle(i % arms, r, p.laneOffset) + gauss() * 0.06` with `a = rand() * Math.PI * 2`; remove the unused `arms` local. Keep `laneOffset` in `DustParams` for now (Task 6 replaces it with `laneTilt`).

`src/galaxy/deepfield.ts`: after `uniforms.uOrbit.value = 0` add `uniforms.uPattern.value = 0` (the far shell must not turn with the pattern).

`src/galaxy/galaxy.ts`: replace the uniforms object with

```ts
    uniforms: {
      ...orbitUniforms(),
      uSize: { value: BASE_POINT_SIZE * pixelRatio },
      uIntensity: { value: STAR_INTENSITY },
    },
```

importing `orbitUniforms` from `./shaders`; add `aEcc: new BufferAttribute(g.ecc, 1),` to the attributes in `buildGeometries`.

`src/scene.ts`: change `let elapsed = 160` to `let elapsed = 0` and replace its comment with `// Density-wave arms need no pre-wind; the pattern is stable from t = 0.`

- [ ] **Step 7: Run everything**

Run: `npm test && npm run build`
Expected: all green. Then `npm run dev` and look: the scene should look like round one with circular orbits (arms will be weak or absent since placement is uniform in phase; that is expected until Task 4).

- [ ] **Step 8: Commit**

```bash
git add src/galaxy src/scene.ts tests
git commit -m "feat: ellipse orbit chunk, per-instance eccentricity and tilt, arm model as tilt mirror"
```

---

### Task 4: Stars: eccentricity, two-component bulge, compact clusters, luminosity, armness, twinkle

**Files:**
- Modify: `src/galaxy/generate.ts`
- Modify: `src/galaxy/shaders.ts` (star vertex and fragment)
- Modify: `src/galaxy/galaxy.ts` (`aLum` attribute, new uniforms, intensity)
- Test: `tests/generate.test.ts`

**Interfaces:**
- Consumes: `eccentricityAt` from `orbit.ts`; `orbitArmness` from the chunk (Task 3).
- Produces: `GalaxyBuffers.lum: Float32Array`; `GalaxyParams` gains `bulgeCoreShare`, `bulgeCoreSigma`, `bulgeHaloSigma` (sigmas as fractions of `bulgeRadius`); constants `LUM_FLOOR`, `LUM_SCALE`, `GIANT_LUM`, `FIELD_ECC_MAX`; star uniforms `uArmLum`, `uArmBlue`, `uTwinkle`; constants `ARM_LUM`, `ARM_BLUE`, `TWINKLE` in galaxy.ts.

- [ ] **Step 1: Write the failing tests**

Replace the body of the first `describe('generateGalaxy')` in `tests/generate.test.ts` with the existing tests plus these (keep the existing ones; `createArmModel()` now takes no arguments):

```ts
  it('carries per-star eccentricity and luminosity buffers', () => {
    expect(g.ecc).toHaveLength(5000)
    expect(g.lum).toHaveLength(5000)
  })

  it('bulge stars are circular, disc stars follow the eccentricity law', () => {
    let circular = 0
    for (let i = 0; i < 5000; i++) {
      const e = g.ecc[i]
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(eccentricityAt(0) + 1e-9)
      if (e === 0) circular++
    }
    // the bulge share is circular; everything else has some eccentricity
    expect(circular / 5000).toBeGreaterThan(GALAXY_DEFAULTS.bulgeFraction * 0.7)
    expect(circular / 5000).toBeLessThan(GALAXY_DEFAULTS.bulgeFraction * 1.3)
  })

  it('luminosity spans the floor to the giant boost with giants above 1', () => {
    let maxLum = 0
    let dim = 0
    for (let i = 0; i < 5000; i++) {
      expect(g.lum[i]).toBeGreaterThanOrEqual(LUM_FLOOR - 1e-9)
      expect(g.lum[i]).toBeLessThanOrEqual((LUM_FLOOR + LUM_SCALE) * GIANT_LUM + 1e-9)
      if (g.spike[i] === 1) expect(g.lum[i]).toBeGreaterThan(1)
      if (g.lum[i] < 0.3) dim++
      maxLum = Math.max(maxLum, g.lum[i])
    }
    // most stars are faint; that is the depth cue
    expect(dim / 5000).toBeGreaterThan(0.6)
    expect(maxLum).toBeGreaterThan(1)
  })

  it('cluster members share one semi-major axis so they never shear apart', () => {
    const groups = new Map<number, number>()
    for (const a of g.radius) groups.set(a, (groups.get(a) ?? 0) + 1)
    let compact = 0
    for (const n of groups.values()) if (n >= 20) compact++
    // max(8, 5000 / 1500) = 8 clusters share 15% of the stars
    expect(compact).toBeGreaterThanOrEqual(6)
  })

  it('bulge has a dense core and a wide halo', () => {
    const core = GALAXY_DEFAULTS.bulgeRadius * GALAXY_DEFAULTS.bulgeCoreSigma * 2
    let inCore = 0
    for (let i = 0; i < 5000; i++) if (g.ecc[i] === 0 && g.radius[i] < core) inCore++
    // the core component alone is bulgeFraction * bulgeCoreShare of all stars
    expect(inCore / 5000).toBeGreaterThan(GALAXY_DEFAULTS.bulgeFraction * GALAXY_DEFAULTS.bulgeCoreShare * 0.6)
  })
```

Add to the imports: `import { eccentricityAt } from '../src/galaxy/orbit'` and extend the generate import with `GIANT_LUM, LUM_FLOOR, LUM_SCALE`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/generate.test.ts`
Expected: FAIL (`lum` undefined, `bulgeCoreSigma` undefined, eccentricities all 0).

- [ ] **Step 3: Generation**

In `src/galaxy/generate.ts`:

Extend `GalaxyParams`:

```ts
  /** Share of bulge stars in the compact core component. */
  bulgeCoreShare: number
  /** Core sigma as a fraction of bulgeRadius. */
  bulgeCoreSigma: number
  /** Halo sigma as a fraction of bulgeRadius; the tails that spill into the disc. */
  bulgeHaloSigma: number
```

and `GALAXY_DEFAULTS`: `bulgeFraction: 0.12`, plus `bulgeCoreShare: 0.35, bulgeCoreSigma: 0.3, bulgeHaloSigma: 2.5`.

Add constants after `BRIGHT_GIANT_CUTOFF`:

```ts
// Luminosity function: brightness grows with the square of size so most
// stars are faint and the few giants carry the light (and cross 1.0 in the
// HDR target, where bloom picks them up).
export const LUM_FLOOR = 0.15
export const LUM_SCALE = 1.0
export const GIANT_LUM = 3.0
const SIZE_MAX = 0.6 + 4.5 // top of the size law before the bulge multiplier
// Field stars are old and mildly eccentric, never on the pattern
export const FIELD_ECC_MAX = 0.1
```

Import `eccentricityAt` from `./orbit`. Add `lum` to `GalaxyBuffers` ("brightness multiplier; giants exceed 1") and allocate `const lum = new Float32Array(n)`.

Replace the cluster seeding so each cluster is an element set:

```ts
  // Star-forming clusters: each is one semi-major axis (members share it
  // exactly, so they stay compact under differential rotation) seeded on an
  // arm ridge at t = 0.
  const clusterCount = Math.max(8, Math.round(n / 1500))
  const clusters: Array<{ a: number; phase: number; y: number }> = []
  for (let c = 0; c < clusterCount; c++) {
    const a = (0.25 + 0.75 * Math.pow(rand(), 1.5)) * p.radius
    clusters.push({
      a,
      phase: ridgePhase(model.ridgeAngle(c % arms, a), a) + gauss() * 0.08,
      y: gauss() * p.thickness * 0.4,
    })
  }
```

with this helper above `generateGalaxy`:

```ts
// Phase at which an ellipse of semi-major axis a sits at world angle `angle`
// at t = 0: the major axis points along tilt(a), so the phase is the angle
// measured from the ridge (ellipse shape ignored; clusters only need to
// start near the arm).
function ridgePhase(angle: number, a: number): number {
  return angle - tilt(a, 0)
}
```

(import `tilt` from `./orbit` as well).

Replace the placement branches:

```ts
    let r: number
    let a: number
    let yy: number
    let e: number
    let clusterMember = false

    if (inBulge) {
      // old population: two gaussian ellipsoids, a compact core and a wide halo
      const sigma = rand() < p.bulgeCoreShare ? p.bulgeCoreSigma : p.bulgeHaloSigma
      const gx = gauss() * 2 * p.bulgeRadius * sigma
      const gz = gauss() * 2 * p.bulgeRadius * sigma
      r = Math.hypot(gx, gz)
      a = Math.atan2(gz, gx)
      yy = gauss() * 2 * p.bulgeRadius * sigma * p.bulgeFlatten
      e = 0
    } else if (inClump) {
      const c = clusters[Math.floor(rand() * clusters.length)]
      r = c.a
      a = c.phase + (gauss() * 0.06) / Math.max(0.4, c.a * 0.5)
      yy = c.y + gauss() * p.thickness * 0.25
      e = eccentricityAt(r)
      clusterMember = true
    } else if (inField) {
      r = Math.sqrt(rand()) * p.radius
      a = rand() * Math.PI * 2
      yy = gauss() * p.thickness * (1.6 - r / p.radius)
      e = rand() * FIELD_ECC_MAX
    } else {
      // disc population on the pattern: uniform phase, the arms come from crowding
      r = (ARM_FLOOR + (1 - ARM_FLOOR) * Math.pow(rand(), ARM_EXPONENT)) * p.radius
      a = rand() * Math.PI * 2
      const t = r / p.radius
      yy = gauss() * p.thickness * (1.0 - 0.75 * t)
      e = eccentricityAt(r)
    }

    // fuzzy edge: gaussian radial jitter, stronger outward, soft cap at 1.2x.
    // Cluster members keep their shared a.
    if (!inBulge && !clusterMember) r += gauss() * 0.15 * (0.3 + r / p.radius)
    r = Math.min(1.2 * p.radius, Math.max(0, r))
    const t = Math.min(1, r / p.radius)
    radius[i] = r
    angle[i] = a
    y[i] = yy
    ecc[i] = e
```

Keep the colour block. Replace the size block's tail so luminosity is written:

```ts
    const s = Math.pow(rand(), inBulge ? 6 : 4)
    const giant = !inBulge && s > BRIGHT_GIANT_CUTOFF
    const baseSize = 0.6 + s * 4.5
    size[i] = baseSize * (inBulge ? 1.2 : 1.0)
    spike[i] = giant ? 1 : 0
    const norm = baseSize / SIZE_MAX
    lum[i] = (LUM_FLOOR + LUM_SCALE * norm * norm) * (giant ? GIANT_LUM : 1.0)
```

and drop the `brighten` multiplier from the colour writes (colour stays chromaticity):

```ts
    color[i * 3] = clamp01(cr * jitter)
    color[i * 3 + 1] = clamp01(cg * jitter)
    color[i * 3 + 2] = clamp01(cb * jitter)
```

Thread `lum` and `ecc` through `sortByY` (`lum: permute(b.lum)`, `ecc: permute(b.ecc)`), and return them.

- [ ] **Step 4: Shaders and material**

In `src/galaxy/shaders.ts`, replace `galaxyVertex` and `galaxyFragment`:

```ts
export const galaxyVertex =
  orbitChunk +
  /* glsl */ `
uniform float uSize;
uniform float uArmLum;
uniform float uArmBlue;
uniform float uTwinkle;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute float aSpike;
attribute float aEcc;
attribute float aLum;
attribute vec3 aColor;
varying vec3 vColor;
varying float vSpike;
varying float vLum;

void main() {
  vec3 world = orbitPosition(aRadius, aAngle, aY, aEcc, 0.0);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = uSize * aSize / max(0.001, -mv.z);
  gl_PointSize = aSpike > 0.5 ? px * 2.5 : px;
  // young population: brighter and bluer while inside an arm
  float arm = orbitArmness(world, aRadius, aEcc, 0.0);
  float lum = aLum * (1.0 + uArmLum * arm);
  // giants only: slow per-star flicker keyed off the phase attribute
  if (aSpike > 0.5) {
    lum *= 1.0 + uTwinkle * sin(uTime * (0.7 + fract(aAngle * 7.31) * 1.3) + aAngle * 13.0);
  }
  vLum = lum;
  vec3 young = vec3(aColor.r * 0.85, aColor.g * 0.95, min(1.0, aColor.b + 0.15));
  vColor = mix(aColor, young, uArmBlue * arm);
  vSpike = aSpike;
}
`

export const galaxyFragment =
  starProfileChunk +
  /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
varying float vSpike;
varying float vLum;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float alpha = vSpike > 0.5 ? starCore(p * 2.5) + starSpikes(p) : starCore(p);
  gl_FragColor = vec4(vColor * uIntensity * vLum, alpha);
}
`
```

In `src/galaxy/galaxy.ts`: `STAR_INTENSITY` becomes `0.6` (starting point; most stars now carry lum about 0.15), add

```ts
/** Extra brightness for stars inside an arm (young population). */
export const ARM_LUM = 0.8
/** Blue shift blend for stars inside an arm. */
export const ARM_BLUE = 0.6
/** Giant flicker amplitude. */
export const TWINKLE = 0.15
```

add the uniforms `uArmLum: { value: ARM_LUM }, uArmBlue: { value: ARM_BLUE }, uTwinkle: { value: TWINKLE }`, and the attribute `aLum: new BufferAttribute(g.lum, 1),`.

- [ ] **Step 5: Run the tests, build, and look**

Run: `npm test && npm run build`
Expected: green. `npm run dev`: two arms emerge from ellipse crowding, brighter and bluer than the inter-arm disc; the bulge has a bright centre with soft tails; giants flicker slowly. Wait two minutes: the pattern turns rigidly, the inner disc does not ring up. If the arms are faint, raise `ORBIT.eInner` (0.3 to 0.45 plausible) or `ARM_LUM`; if they look like two hard lines, lower `ARM_POWER` (2 to 4 plausible). Note candidate values for Task 12; do not tune beyond a first pass here.

- [ ] **Step 6: Commit**

```bash
git add src/galaxy tests/generate.test.ts
git commit -m "feat: stars on the density wave with a luminosity function, two-component bulge, compact clusters, armness, twinkle"
```

---

### Task 5: Glow on the wave: armness, two-component bulge, proximity attenuation

**Files:**
- Modify: `src/galaxy/glow.ts`
- Modify: `src/scene.ts` (per-frame proximity write)
- Test: `tests/glow.test.ts`

**Interfaces:**
- Consumes: `eccentricityAt`; billboard `vArm` varying (Task 3).
- Produces: `GlowParams` gains `bulgeCoreShare`, `bulgeCoreSigma`, `bulgeHaloSigma`; constants `GLOW_ARM`, `PROXIMITY = { near, far, min }`; `GlowLayer.setProximity(distance: number)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/glow.test.ts` (and change `createArmModel(ARM_DEFAULTS, mulberry(1))` to `createArmModel()` in both describes):

```ts
  it('disc haze follows the eccentricity law; bulge haze is circular', () => {
    let circular = 0
    for (let i = 0; i < 1000; i++) {
      if (g.ecc[i] === 0) circular++
      else expect(g.ecc[i]).toBeCloseTo(eccentricityAt(g.radius[i]), 6)
    }
    expect(circular / 1000).toBeGreaterThan(GLOW_DEFAULTS.bulgeFraction * 0.7)
  })

  it('bulge haze has a compact core component', () => {
    const core = GLOW_DEFAULTS.bulgeRadius * GLOW_DEFAULTS.bulgeCoreSigma * 2
    let inCore = 0
    for (let i = 0; i < 1000; i++) if (g.ecc[i] === 0 && g.radius[i] < core) inCore++
    expect(inCore / 1000).toBeGreaterThan(GLOW_DEFAULTS.bulgeFraction * GLOW_DEFAULTS.bulgeCoreShare * 0.6)
  })
```

and in the `createGlow` test, after `layer.setTime(12)`:

```ts
    layer.setProximity(6)
    expect(layer.mesh.material.uniforms.uProximity.value).toBe(6)
    expect(layer.mesh.material.uniforms.uGlowArm.value).toBeGreaterThan(0)
```

Import `eccentricityAt` from `../src/galaxy/orbit`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/glow.test.ts`
Expected: FAIL (`ecc` all zero, `setProximity` missing).

- [ ] **Step 3: Implement**

In `src/galaxy/glow.ts`:

Extend `GlowParams` with `bulgeCoreShare: number`, `bulgeCoreSigma: number`, `bulgeHaloSigma: number` (same meaning as the star params) and `GLOW_DEFAULTS` with `bulgeCoreShare: 0.4, bulgeCoreSigma: 0.3, bulgeHaloSigma: 2.5`. Add constants:

```ts
/** How much of the disc haze is confined to the arms (0 uniform, 1 arms only). */
export const GLOW_ARM = 0.7
/** Camera distance to the origin at which the haze is at full strength / attenuated to `min`. */
export const PROXIMITY = { far: 7.0, near: 5.5, min: 0.45 }
```

Import `eccentricityAt` from `./orbit`. In `generateGlow`, the bulge branch becomes

```ts
      const sigma = rand() < p.bulgeCoreShare ? p.bulgeCoreSigma : p.bulgeHaloSigma
      const gx = gauss() * 2 * p.bulgeRadius * sigma
      const gz = gauss() * 2 * p.bulgeRadius * sigma
      r = Math.hypot(gx, gz)
      a = Math.atan2(gz, gx)
      yy = gauss() * 2 * p.bulgeRadius * sigma * 0.6
      color = p.palette[0]
      b.ecc[i] = 0
```

and the disc branch adds `b.ecc[i] = eccentricityAt(r)` after computing `r`. (The `r = Math.min(1.2 * p.radius, r)` clamp stays after the branches; compute `ecc` from the clamped `r` by moving the assignment below the clamp: `b.ecc[i] = inBulge ? 0 : eccentricityAt(r)`.)

Replace the fragment:

```ts
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
```

Uniforms in `createGlow`:

```ts
  const uniforms = {
    ...billboardUniforms(width, height),
    uIntensity: { value: GLOW_INTENSITY },
    uGlowArm: { value: GLOW_ARM },
    uProximity: { value: PROXIMITY.far },
    uProxLaw: { value: new Vector3(PROXIMITY.far, PROXIMITY.near, PROXIMITY.min) },
  }
```

(import `Vector3` from three). Add to `GlowLayer`:

```ts
  /** Camera distance to the origin; attenuates the haze as the camera closes in. */
  setProximity(distance: number): void
```

implemented as `uniforms.uProximity.value = distance`.

Note on armness for bulge instances: `vArm` is 0 for e = 0, so bulge haze alpha is scaled by `1 - uGlowArm`. Compensate by raising `bulgeAlphaScale` from 0.2 to 0.5 (starting value; the bulge now has a core component that piles up less than the old single gaussian did).

In `src/scene.ts` `tick()`, after `dust.setFade(...)`:

```ts
    glow.setProximity(camera.position.length())
```

- [ ] **Step 4: Run the tests, build, and look**

Run: `npm test && npm run build`
Expected: green. `npm run dev`: haze concentrates in the arms; the core is a bright peak fading into a wide halo instead of a flat cream disc; zooming in dims the haze rather than whiting out.

- [ ] **Step 5: Commit**

```bash
git add src/galaxy/glow.ts src/scene.ts tests/glow.test.ts
git commit -m "feat: glow follows the density wave, two-component bulge, proximity attenuation"
```

---

### Task 6: Dust: lane tilt, elongated atlas cells, tangent alignment, skewed opacity, dark clumps

**Files:**
- Modify: `src/galaxy/noise.ts` (`renderCloudCell` gains an aspect argument)
- Modify: `src/galaxy/dust.ts`
- Test: `tests/noise.test.ts`, `tests/dust.test.ts`

**Interfaces:**
- Consumes: `eccentricityAt`; billboard `tilt`, `ecc` buffers, `uAlign`, `vArm` (Task 3).
- Produces: `renderCloudCell(size, seed, aspect = 1)`; `ATLAS_CELLS = 8`, `ATLAS_COLS = 4`, `ATLAS_ROWS = 2`, `ELONGATED_FROM = 4` (cells 4..7 are elongated), `ELONGATED_ASPECT = 2.5`; `DustParams` replaces `laneOffset` with `laneTilt` (radians), gains `clumpFraction`, `clumpSizeMin`, `clumpSizeMax`, `alphaFloor`, `alphaPower`; constant `DUST_ARM`; `DustLayer` unchanged in shape.

- [ ] **Step 1: Write the failing tests**

Append to `tests/noise.test.ts`:

```ts
  it('an elongated cell is wider along x than along y', () => {
    const size = 64
    const cell = renderCloudCell(size, 5, 2.5)
    const mid = size / 2
    let alongX = 0
    let alongY = 0
    for (let i = 0; i < size; i++) {
      if (cell[mid * size + i] > 0) alongX++
      if (cell[i * size + mid] > 0) alongY++
    }
    expect(alongX).toBeGreaterThan(alongY * 1.5)
  })
```

Replace `tests/dust.test.ts`'s `generateDust` describe with:

```ts
describe('generateDust', () => {
  const model = createArmModel()
  const d = generateDust({ ...DUST_DEFAULTS, count: 2000 }, model, mulberry(11))

  it('keeps the bulge dust-free and stays inside the disc', () => {
    for (const r of d.radius) {
      expect(r).toBeGreaterThanOrEqual(DUST_DEFAULTS.bulgeRadius * 1.5)
      expect(r).toBeLessThanOrEqual(DUST_DEFAULTS.radius * 1.05)
    }
  })

  it('uses all eight atlas cells, clumps only the round ones', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const s = d.shape[i]
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(ATLAS_CELLS)
      seen.add(s)
      if (d.size[i] <= DUST_DEFAULTS.clumpSizeMax && d.tilt[i] === 0 && d.alpha[i] >= 0.9) {
        expect(s).toBeLessThan(ELONGATED_FROM)
      }
    }
    expect(seen.size).toBe(ATLAS_CELLS)
  })

  it('lane instances carry the concave-side tilt and the eccentricity law', () => {
    let lanes = 0
    for (let i = 0; i < 2000; i++) {
      expect(d.ecc[i]).toBeCloseTo(eccentricityAt(d.radius[i]), 6)
      // buffers are Float32Array: compare with a tolerance, never ===
      if (Math.abs(d.tilt[i] + DUST_DEFAULTS.laneTilt) < 1e-6) lanes++
      else expect(d.tilt[i]).toBe(0)
    }
    expect(lanes / 2000).toBeGreaterThan(DUST_DEFAULTS.laneFraction * 0.8)
  })

  it('has a dark clump population: small, dense, on the ridge', () => {
    let clumps = 0
    for (let i = 0; i < 2000; i++) {
      if (d.size[i] <= DUST_DEFAULTS.clumpSizeMax) {
        clumps++
        expect(d.size[i]).toBeGreaterThanOrEqual(DUST_DEFAULTS.clumpSizeMin)
        expect(d.alpha[i]).toBeGreaterThanOrEqual(0.9)
        expect(d.tilt[i]).toBe(0)
      }
    }
    expect(clumps / 2000).toBeGreaterThan(DUST_DEFAULTS.clumpFraction * 0.7)
    expect(clumps / 2000).toBeLessThan(DUST_DEFAULTS.clumpFraction * 1.3)
  })

  it('cloud opacity is skewed thin with a floor', () => {
    let thin = 0
    let total = 0
    for (let i = 0; i < 2000; i++) {
      if (d.size[i] <= DUST_DEFAULTS.clumpSizeMax) continue
      total++
      expect(d.alpha[i]).toBeGreaterThanOrEqual(DUST_DEFAULTS.alphaFloor - 1e-9)
      expect(d.alpha[i]).toBeLessThanOrEqual(1)
      if (d.alpha[i] < 0.5) thin++
    }
    expect(thin / total).toBeGreaterThan(0.5)
  })

  it('is thin in y with small rotation jitter', () => {
    for (let i = 0; i < 2000; i++) {
      expect(Math.abs(d.y[i])).toBeLessThan(DUST_DEFAULTS.thickness * 1.5)
      expect(Math.abs(d.rotation[i])).toBeLessThanOrEqual(DUST_DEFAULTS.rotationJitter + 1e-6)
    }
  })
})
```

Extend the imports: `ATLAS_CELLS, ELONGATED_FROM` from dust, `eccentricityAt` from orbit. In the `createDust` test, add after `layer.setFade(0.5)`:

```ts
    expect(layer.mesh.material.uniforms.uAlign.value).toBe(1)
    expect(layer.mesh.material.uniforms.uDustArm.value).toBeGreaterThan(0)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/noise.test.ts tests/dust.test.ts`
Expected: FAIL (`renderCloudCell` ignores aspect; `laneTilt`, `clumpFraction`, `ATLAS_CELLS` missing).

- [ ] **Step 3: Elongated cells**

In `src/galaxy/noise.ts`, change `renderCloudCell`:

```ts
/**
 * One atlas cell: a filamentary cloud mask in [0, 1] with a soft radial
 * edge. `aspect` above 1 stretches the cloud and its filaments along x, for
 * cells that lie along a dust lane.
 */
export function renderCloudCell(size: number, seed: number, aspect = 1): Float32Array {
  const out = new Float32Array(size * size)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size * 2 - 1
      const v = (py + 0.5) / size * 2 - 1
      const rad = Math.hypot(u, v * aspect)
      const edge = 1 - smoothClamp(rad, 0.55, 1.0)
      const n = fbm((u * 2.5) / aspect + seed * 7, v * 2.5 + seed * 3, seed)
      const filaments = smoothClamp(n, 0.38, 0.72)
      out[py * size + px] = filaments * edge
    }
  }
  return out
}
```

- [ ] **Step 4: Dust generation, atlas, material**

In `src/galaxy/dust.ts`:

Constants (replace `const ATLAS_CELLS = 4`):

```ts
export const ATLAS_CELLS = 8
export const ATLAS_COLS = 4
export const ATLAS_ROWS = 2
/** Cells at and past this index are elongated along the orbit tangent. */
export const ELONGATED_FROM = 4
export const ELONGATED_ASPECT = 2.5
/** How much of the cloud absorption is confined to the lanes (0 uniform, 1 lanes only). */
export const DUST_ARM = 0.6
```

`DustParams`: remove `laneOffset`; add

```ts
  /** Tilt offset of the lane ellipses toward the concave side of the star ridge (radians). */
  laneTilt: number
  /** Share of instances that are small dense clumps sitting on the ridge itself. */
  clumpFraction: number
  clumpSizeMin: number
  clumpSizeMax: number
  /** Cloud opacity floor; opacity is floor + (1 - floor) * rand^alphaPower. */
  alphaFloor: number
  alphaPower: number
  /** Rotation jitter about the tangent (radians, either sign). */
  rotationJitter: number
```

`DUST_DEFAULTS`: `laneTilt: 0.22, clumpFraction: 0.15, clumpSizeMin: 0.08, clumpSizeMax: 0.16, alphaFloor: 0.15, alphaPower: 2.2, rotationJitter: 0.3` alongside the existing count 2500, radius 4.5, thickness 0.35, bulgeRadius 0.55, laneFraction 0.7, sizeMin 0.2, sizeMax 0.6.

Import `eccentricityAt` from `./orbit`. Replace the generation loop body:

```ts
  for (let i = 0; i < p.count; i++) {
    const roll = rand()
    const clump = roll < p.clumpFraction
    const lane = !clump && roll < p.clumpFraction + p.laneFraction
    let r: number
    if (clump || lane) {
      r = inner + (outer - inner) * Math.pow(rand(), 1.2)
    } else {
      r = Math.sqrt(lerp(inner * inner, outer * outer, rand()))
    }
    const t = r / p.radius
    b.radius[i] = r
    b.angle[i] = rand() * Math.PI * 2
    b.y[i] = gauss() * p.thickness * 0.5 * (1 - 0.5 * t)
    b.ecc[i] = eccentricityAt(r)
    b.tilt[i] = lane ? -p.laneTilt : 0
    b.rotation[i] = (rand() * 2 - 1) * p.rotationJitter
    if (clump) {
      b.size[i] = lerp(p.clumpSizeMin, p.clumpSizeMax, rand())
      b.shape[i] = Math.floor(rand() * ELONGATED_FROM)
      b.alpha[i] = 0.9 + 0.1 * rand()
    } else {
      b.size[i] = lerp(p.sizeMin, p.sizeMax, rand())
      b.shape[i] = Math.floor(rand() * ATLAS_CELLS)
      b.alpha[i] = p.alphaFloor + (1 - p.alphaFloor) * Math.pow(rand(), p.alphaPower)
    }
    b.color[i * 3] = 1
    b.color[i * 3 + 1] = 1
    b.color[i * 3 + 2] = 1
  }
```

(`clumpSizeMax` 0.16 is below `sizeMin` 0.2, which is what lets the tests tell clumps from clouds by size.)

Atlas: `buildDustAtlas(cellSize = 256, seed = 1)`, canvas `cellSize * ATLAS_COLS` by `cellSize * ATLAS_ROWS`, image data the same, loop `for (let cell = 0; cell < ATLAS_CELLS; cell++)` with

```ts
    const aspect = cell >= ELONGATED_FROM ? ELONGATED_ASPECT : 1
    const mask = renderCloudCell(cellSize, seed + cell, aspect)
    const ox = (cell % ATLAS_COLS) * cellSize
    const oy = Math.floor(cell / ATLAS_COLS) * cellSize
```

and the pixel index `((oy + y) * cellSize * ATLAS_COLS + ox + x) * 4`.

Fragment:

```ts
const dustFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uAbsorb;
uniform vec3 uTint;
uniform float uFade;
uniform float uDustArm;
varying vec2 vUv;
varying float vAlpha;
varying float vShape;
varying float vArm;

void main() {
  vec2 cell = vec2(mod(vShape, 4.0), floor(vShape / 4.0));
  float mask = texture2D(uAtlas, (vUv + cell) * vec2(0.25, 0.5)).r;
  float arm = mix(1.0 - uDustArm, 1.0, vArm);
  float a = mask * vAlpha * uAbsorb * uFade * arm;
  // transmission per channel; the framebuffer is multiplied by this
  gl_FragColor = vec4(1.0 - a * uTint, 1.0);
}
`
```

Uniforms in `createDust`: add `uDustArm: { value: DUST_ARM }` and set `uniforms.uAlign.value = 1` after building the uniform object.

- [ ] **Step 5: Run the tests, build, and look**

Run: `npm test && npm run build`
Expected: green. `npm run dev`: lanes hug the concave edge of each arm as filaments lying along the flow, with small dark knots on the ridges; no rings inside the bulge radius. If lanes sit on the convex side, flip the sign of `laneTilt` in generation (`b.tilt[i] = p.laneTilt`) and record it. If the lanes are too faint after the skewed opacity, raise `DUST_ABSORB` (0.65 to 0.9 plausible).

- [ ] **Step 6: Commit**

```bash
git add src/galaxy/noise.ts src/galaxy/dust.ts tests/noise.test.ts tests/dust.test.ts
git commit -m "feat: dust lanes on the wave with elongated aligned cells, skewed opacity, dark clumps"
```

---

### Task 7: Beacons as in-scene stars

**Files:**
- Modify: `src/nodes/beacons.ts`
- Modify: `src/galaxy/generate.ts` (remove the `orbitalSpeed` re-export)
- Test: `tests/beacons.test.ts`

**Interfaces:**
- Consumes: `solveElements`, `orbitPosition`, `Elements` from orbit.ts; `allocBillboards`, `createBillboardGeometry`, `billboardUniforms`, `billboardVertex` from billboard.ts; `RENDER_ORDER`.
- Produces: `Beacons` interface unchanged (`group`, `pick`, `update(elapsed)`, `worldPosition(id)`); constants `BEACON_COLOR = '#8cc0ff'`, `BEACON_INTENSITY`, `BEACON_SIZE`; `beaconFragment` exported for tests.

- [ ] **Step 1: Write the failing tests**

Replace `tests/beacons.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { beaconFragment, createBeacons } from '../src/nodes/beacons'
import { NODES } from '../src/nodes/registry'
import { orbitPosition, solveElements } from '../src/galaxy/orbit'
import { RENDER_ORDER } from '../src/galaxy/order'

function lookAt(pos: Vector3) {
  const camera = new PerspectiveCamera(55, 1, 0.1, 200)
  camera.position.set(pos.x, pos.y, pos.z + 3)
  camera.lookAt(pos.x, pos.y, pos.z)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(0, 0), camera)
  return ray
}

describe('beacons', () => {
  const beacons = createBeacons(NODES)

  it('draws every node in one instanced mesh plus one hit sphere per node', () => {
    const meshes = beacons.group.children.filter((c) => (c as Mesh).isMesh)
    expect(meshes.length).toBe(NODES.length + 1)
    const instanced = meshes.find((m) => 'instanceCount' in (m as Mesh).geometry) as Mesh
    expect(instanced).toBeDefined()
    expect((instanced.geometry as { instanceCount: number }).instanceCount).toBe(NODES.length)
  })

  it('pick returns the node id under the pointer', () => {
    const [x, y, z] = NODES[0].position
    expect(beacons.pick(lookAt(new Vector3(x, y, z)))).toBe('github')
  })

  it('pick returns null when nothing is hit', () => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 200)
    camera.position.set(0, 50, 0)
    camera.lookAt(0, 100, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(0, 0), camera)
    expect(beacons.pick(ray)).toBeNull()
  })

  it('fragment draws a spiked core and a pulsing ring', () => {
    expect(beaconFragment).toContain('ring')
    expect(beaconFragment).toContain('uTime')
  })
})

describe('beacon orbit', () => {
  it('update(0) keeps beacons at their registry positions', () => {
    const orbiting = createBeacons(NODES)
    orbiting.update(0)
    const [x, y, z] = NODES[0].position
    const pos = orbiting.worldPosition('github')
    expect(pos.x).toBeCloseTo(x, 4)
    expect(pos.y).toBeCloseTo(y, 6)
    expect(pos.z).toBeCloseTo(z, 4)
  })

  it('update(elapsed) follows the density-wave orbit through the registry position', () => {
    const orbiting = createBeacons(NODES)
    const [x, y, z] = NODES[0].position
    const expected = orbitPosition(solveElements(x, y, z, 0), 10, new Vector3())
    orbiting.update(10)
    const pos = orbiting.worldPosition('github')
    expect(pos.x).toBeCloseTo(expected.x, 5)
    expect(pos.y).toBeCloseTo(expected.y, 5)
    expect(pos.z).toBeCloseTo(expected.z, 5)
  })

  it('worldPosition returns a live reference that tracks updates', () => {
    const orbiting = createBeacons(NODES)
    const pos = orbiting.worldPosition('github')
    const before = pos.x
    orbiting.update(20)
    expect(pos.x).not.toBeCloseTo(before, 5)
  })

  it('picking still works after an orbit update', () => {
    const orbiting = createBeacons(NODES)
    orbiting.update(15)
    expect(orbiting.pick(lookAt(orbiting.worldPosition('github')))).toBe('github')
  })

  it('feeds the GPU the same time it moves the hit spheres with', () => {
    const orbiting = createBeacons(NODES)
    orbiting.update(33)
    const instanced = orbiting.group.children.find(
      (c) => 'instanceCount' in (c as Mesh).geometry,
    ) as Mesh
    const material = instanced.material as { uniforms: { uTime: { value: number } } }
    expect(material.uniforms.uTime.value).toBe(33)
    expect(instanced.renderOrder).toBe(0) // groupOrder on beacons.group carries the layer order
    expect(RENDER_ORDER.beacons).toBeGreaterThan(RENDER_ORDER.nearStars)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/beacons.test.ts`
Expected: FAIL (`beaconFragment` missing; sprites instead of an instanced mesh).

- [ ] **Step 3: Rewrite beacons.ts**

```ts
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
}

interface Orbit {
  elements: Elements
  hit: Mesh
}

export const beaconFragment = /* glsl */ `
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
  float ring = exp(-pow((len - ringR) * 40.0, 2.0)) * (0.25 + 0.2 * pulse);
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
  }
}
```

Viewport: the beacon material needs the drawing-buffer size for its pixel cap. Add to the `Beacons` interface `setViewport(width: number, height: number): void` implemented as `uniforms.uViewport.value.set(w, h); uniforms.uMaxPx.value = h * 0.5`, and call it from `src/main.ts` after `createBeacons`: `beacons.setViewport(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio)` plus on `resize` (add a listener in main.ts next to the e2e hook). The exact pixel ratio the scene uses is internal to scene.ts; using `devicePixelRatio` here only affects the cap, which for a 0.55-unit sprite never binds in practice.

Remove `export { orbitalSpeed } from './orbit'` from `src/galaxy/generate.ts` (nothing imports it now; grep to confirm).

- [ ] **Step 4: Run the tests, build, and look**

Run: `npm test && npm run build && grep -rn orbitalSpeed src`
Expected: green; grep returns only orbit.ts. `npm run dev`: beacons are small bright blue-white stars with cross spikes and a faint breathing ring, blooming on the HDR path; clicking and chevron navigation still work; the panel leader line lands on the star.

- [ ] **Step 5: Commit**

```bash
git add src/nodes/beacons.ts src/galaxy/generate.ts src/main.ts tests/beacons.test.ts
git commit -m "feat: beacons as instanced spiked stars with pulsing rings on the shared orbit"
```

---

### Task 8: Camera clamp

**Files:**
- Modify: `src/camera/controls.ts`
- Test: `tests/controls.test.ts` (new), `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `MIN_POLAR_DEG = 12`, `MAX_POLAR_DEG = 168`, `MIN_DISTANCE = 5.5`, `MAX_DISTANCE = 18` exported from controls.ts.

- [ ] **Step 1: Write the failing tests**

Create `tests/controls.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_DISTANCE, MAX_POLAR_DEG, MIN_DISTANCE, MIN_POLAR_DEG } from '../src/camera/controls'
import { FADE_FULL } from '../src/galaxy/dust'
import { GALAXY_DEFAULTS } from '../src/galaxy/generate'

describe('camera limits', () => {
  it('keeps the camera off the plane on both sides', () => {
    expect(MIN_POLAR_DEG).toBe(12)
    expect(MAX_POLAR_DEG).toBe(180 - MIN_POLAR_DEG)
  })

  it('never lets the dust plane fade engage in normal use', () => {
    expect(Math.sin((MIN_POLAR_DEG * Math.PI) / 180)).toBeGreaterThan(FADE_FULL)
  })

  it('keeps the closest approach outside the nominal disc', () => {
    expect(MIN_DISTANCE).toBeGreaterThan(GALAXY_DEFAULTS.radius)
    expect(MAX_DISTANCE).toBeGreaterThan(MIN_DISTANCE)
  })
})
```

Add to `e2e/smoke.spec.ts`:

```ts
test('the camera stays at least 12 degrees off the galactic plane', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const inclination = async () => {
    const text = await page.locator('.hud-tele-br .hud-tele-line').nth(1).textContent()
    return Number((text ?? '').replace(/\D/g, ''))
  }
  // drag far downward: the camera rises toward the pole; then far upward: it dives under the plane
  await page.mouse.move(800, 200)
  await page.mouse.down()
  await page.mouse.move(800, 900, { steps: 30 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  expect(await inclination()).toBeGreaterThanOrEqual(12)
  await page.mouse.move(800, 800)
  await page.mouse.down()
  await page.mouse.move(800, 0, { steps: 40 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const inc = await inclination()
  expect(inc).toBeGreaterThanOrEqual(12)
  expect(inc).toBeLessThanOrEqual(168)
})
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx vitest run tests/controls.test.ts`
Expected: FAIL, constants not exported.

- [ ] **Step 3: Implement**

In `src/camera/controls.ts`, add after the existing constants:

```ts
// The camera never reaches the galactic plane: near edge-on the additive
// layers saturate to a white sheet and the far/near star split cannot place
// the dust correctly. Twelve degrees keeps both problems out of reach.
export const MIN_POLAR_DEG = 12
export const MAX_POLAR_DEG = 180 - MIN_POLAR_DEG
// Closest approach stays outside the nominal disc radius (4.5).
export const MIN_DISTANCE = 5.5
export const MAX_DISTANCE = 18
```

and replace `controls.minDistance = 4` / `controls.maxDistance = 18` with

```ts
  controls.minDistance = MIN_DISTANCE
  controls.maxDistance = MAX_DISTANCE
  controls.minPolarAngle = (MIN_POLAR_DEG * Math.PI) / 180
  controls.maxPolarAngle = (MAX_POLAR_DEG * Math.PI) / 180
```

- [ ] **Step 4: Run tests, build, e2e**

Run: `npm test && npm run build && npx playwright test e2e/smoke.spec.ts --project=chromium`
Expected: green. The new e2e test passes on the ladder floor too (the clamp is camera-side).

- [ ] **Step 5: Commit**

```bash
git add src/camera/controls.ts tests/controls.test.ts e2e/smoke.spec.ts
git commit -m "feat: clamp the camera 12 degrees off the plane and outside the disc"
```

---

### Task 9: Background: denser starfield, fainter deep field

**Files:**
- Modify: `src/galaxy/starfield.ts`, `src/galaxy/deepfield.ts`, `src/scene.ts`
- Test: `tests/starfield.test.ts`, `tests/deepfield.test.ts`

**Interfaces:**
- Produces: `STARFIELD_COUNT = 7000`, `STARFIELD_BRIGHT = 24` (starfield.ts); `DEEP_FIELD_COUNT = 120`, `DEEP_SIZE = [0.25, 0.7]`, `DEEP_ALPHA = [0.06, 0.18]` (deepfield.ts). `createStarfield(pixelRatio, count = STARFIELD_COUNT, brightCount = STARFIELD_BRIGHT, rand)` and `createDeepField(width, height, count = DEEP_FIELD_COUNT, rand)` keep their signatures.

- [ ] **Step 1: Write the failing tests**

Append to `tests/starfield.test.ts` inside `generateStarfield`:

```ts
  it('most background stars are sub-pixel', () => {
    let small = 0
    for (let i = 20; i < 1000; i++) if (s.size[i] < 1) small++
    expect(small / 980).toBeGreaterThan(0.75)
  })
```

and a new describe:

```ts
import { STARFIELD_BRIGHT, STARFIELD_COUNT } from '../src/galaxy/starfield'

describe('starfield defaults', () => {
  it('ships a dense field with a couple dozen bright stars', () => {
    expect(STARFIELD_COUNT).toBe(7000)
    expect(STARFIELD_BRIGHT).toBe(24)
  })
})
```

In `tests/deepfield.test.ts`, change the range assertions to the new constants and add the count check:

```ts
import { createDeepField, DEEP_ALPHA, DEEP_FIELD_COUNT, DEEP_SIZE, generateDeepField } from '../src/galaxy/deepfield'
// inside the loop:
      expect(d.alpha[i]).toBeGreaterThanOrEqual(DEEP_ALPHA[0] - 1e-9)
      expect(d.alpha[i]).toBeLessThanOrEqual(DEEP_ALPHA[1] + 1e-9)
      expect(d.size[i]).toBeGreaterThanOrEqual(DEEP_SIZE[0] - 1e-9)
      expect(d.size[i]).toBeLessThanOrEqual(DEEP_SIZE[1] + 1e-9)
// new test:
  it('ships 120 faint smudges', () => {
    expect(DEEP_FIELD_COUNT).toBe(120)
    expect(DEEP_ALPHA[1]).toBeLessThan(0.2)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/starfield.test.ts tests/deepfield.test.ts`
Expected: FAIL (constants missing; sizes and alphas in the old ranges).

- [ ] **Step 3: Implement**

`src/galaxy/starfield.ts`: add

```ts
export const STARFIELD_COUNT = 7000
export const STARFIELD_BRIGHT = 24
```

change the size law to `size[i] = bright ? 3.5 + rand() * 1.5 : 0.4 + Math.pow(rand(), 6) * 2.2`, and the `createStarfield` defaults to `count = STARFIELD_COUNT, brightCount = STARFIELD_BRIGHT`. `STARFIELD_INTENSITY` starts at 0.5 (the field is nearly three times denser).

`src/galaxy/deepfield.ts`: add

```ts
export const DEEP_FIELD_COUNT = 120
export const DEEP_SIZE: [number, number] = [0.25, 0.7]
export const DEEP_ALPHA: [number, number] = [0.06, 0.18]
```

use them in `generateDeepField` (`b.size[i] = lerp(DEEP_SIZE[0], DEEP_SIZE[1], rand())`, `b.alpha[i] = lerp(DEEP_ALPHA[0], DEEP_ALPHA[1], rand())`) and as the `createDeepField` default count.

`src/scene.ts` needs no change (it calls both factories with defaults).

- [ ] **Step 4: Run tests, build, look**

Run: `npm test && npm run build`
Expected: green. `npm run dev`: the background reads as fine texture; the smudges are barely there unless you look for them.

- [ ] **Step 5: Commit**

```bash
git add src/galaxy/starfield.ts src/galaxy/deepfield.ts tests/starfield.test.ts tests/deepfield.test.ts
git commit -m "feat: denser sub-pixel starfield, smaller fainter deep field"
```

---

### Task 10: Finish pass grain

**Files:**
- Modify: `src/render/post.ts`, `src/scene.ts`
- Test: `tests/post.test.ts`

**Interfaces:**
- Produces: `GRAIN = 1.5`; `finishShader.uniforms.uTime`, `uGrain`; `PostChain.setTime(t: number)` (no-op on the direct path).

- [ ] **Step 1: Write the failing test**

Append to the `finishShader` describe in `tests/post.test.ts`:

```ts
  it('carries animated grain that lives in the shadows', () => {
    expect(finishShader.uniforms.uGrain.value).toBe(GRAIN)
    expect(finishShader.uniforms.uTime.value).toBe(0)
    expect(finishShader.fragmentShader).toContain('uGrain')
    expect(finishShader.fragmentShader).toContain('luma')
  })
```

(import `GRAIN` from post.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/post.test.ts`
Expected: FAIL, `uGrain` undefined.

- [ ] **Step 3: Implement**

In `src/render/post.ts`: add `export const GRAIN = 1.5` (in 8-bit LSBs at black). Extend `finishShader.uniforms` with `uTime: { value: 0 }` and `uGrain: { value: GRAIN }`, and the fragment:

```glsl
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
  // animated grain, strongest in the shadows, frozen when uTime is held at 0
  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec2 seed = gl_FragCoord.xy + vec2(fract(uTime * 0.731) * 917.0, fract(uTime * 0.457) * 613.0);
  float g = fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c.rgb += g * (uGrain / 255.0) * (1.0 - luma);
  gl_FragColor = c;
}
```

Add `setTime(t: number): void` to `PostChain` (documented "finish-pass clock; hold at 0 for static grain"), implemented on the HDR path as `finish.uniforms.uTime.value = t` (`finish` is the `ShaderPass`; its `uniforms` are the shader's) and as a no-op on the direct path.

In `src/scene.ts` `tick()`, before `post.render()`: `post.setTime(reducedMotion ? 0 : elapsed)`.

- [ ] **Step 4: Run tests, build, look**

Run: `npm test && npm run build`
Expected: green. `npm run dev`: a faint living grain in the dark corners, invisible over the core. If it reads as noise, halve `GRAIN`.

- [ ] **Step 5: Commit**

```bash
git add src/render/post.ts src/scene.ts tests/post.test.ts
git commit -m "feat: animated shadow grain in the finish pass"
```

---

### Task 11: HUD: hint placement and beacon tags

**Files:**
- Modify: `src/styles.css`
- Modify: `src/nodes/registry.ts` (`tag` field)
- Create: `src/hud/tags.ts`
- Modify: `src/main.ts` (wire tags)
- Test: `tests/tags.test.ts` (new), `tests/registry.test.ts`, `e2e/smoke.spec.ts`, `e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `toScreen` from `hud/projector.ts`; `Hud.openId()`; `Beacons.worldPosition(id)`.
- Produces: `GalaxyNode.tag?: string`; `tagFor(node: { tag?: string; designation: string }): string`; `tagVisible(input: { id: string; openId: string | null; onScreen: boolean; width: number }): boolean`; `TAG_MAX_WIDTH = 640`; `createTags(root, nodes, position: (id) => Vector3, openId: () => string | null): { update(camera: Camera): void }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tags.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TAG_MAX_WIDTH, tagFor, tagVisible } from '../src/hud/tags'

describe('beacon tags', () => {
  it('uses the explicit tag, else the designation head', () => {
    expect(tagFor({ tag: 'GH-01', designation: 'NODE 01 · GH-SECTOR' })).toBe('GH-01')
    expect(tagFor({ designation: 'NODE 02 · COMMS-RELAY' })).toBe('NODE 02')
  })

  it('hides while that node panel is open, off screen, or at phone widths', () => {
    const base = { id: 'github', openId: null, onScreen: true, width: 1600 }
    expect(tagVisible(base)).toBe(true)
    expect(tagVisible({ ...base, openId: 'github' })).toBe(false)
    expect(tagVisible({ ...base, openId: 'email' })).toBe(true)
    expect(tagVisible({ ...base, onScreen: false })).toBe(false)
    expect(tagVisible({ ...base, width: TAG_MAX_WIDTH })).toBe(false)
    expect(tagVisible({ ...base, width: TAG_MAX_WIDTH + 1 })).toBe(true)
  })
})
```

Add to `tests/registry.test.ts`:

```ts
  it('every node has a short tag for the sector map', () => {
    for (const n of NODES) expect(n.tag).toMatch(/^[A-Z]{2}-\d\d$/)
    expect(new Set(NODES.map((n) => n.tag)).size).toBe(NODES.length)
  })
```

Add to `e2e/smoke.spec.ts`:

```ts
test('beacon tags label every node on desktop', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await expect(page.locator('.hud-tag')).toHaveCount(5)
  await expect(page.locator('.hud-tag', { hasText: 'GH-01' })).toBeVisible()
})

test('the first-visit hint sits in the lower third', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.hud-hint')).toHaveClass(/open/, { timeout: 5000 })
  const box = await page.locator('.hud-hint').boundingBox()
  const height = await page.evaluate(() => innerHeight)
  expect(box!.y).toBeGreaterThan(height * 0.66)
})
```

Add to `e2e/mobile.spec.ts`:

```ts
test('beacon tags stay hidden on phones', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await expect(page.locator('.hud-tag').first()).toBeHidden()
})
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `npx vitest run tests/tags.test.ts tests/registry.test.ts`
Expected: FAIL (module missing; `tag` undefined).

- [ ] **Step 3: Registry tags**

In `src/nodes/registry.ts`, add to `GalaxyNode`:

```ts
  /** Short persistent label drawn beside the beacon on desktop (sector-map tag). */
  tag?: string
```

and set `tag: 'GH-01'` (github), `'EM-02'` (email), `'LI-03'` (linkedin), `'PL-04'` (pliny), `'GT-05'` (gatehouse).

- [ ] **Step 4: Tags module**

Create `src/hud/tags.ts`:

```ts
import type { Camera, Vector3 } from 'three'
import { toScreen } from './projector'

// Persistent designation tags beside each beacon: the sector-map framing.
// Pure rules are exported for tests; DOM work stays in createTags. Writes
// happen only when a rounded screen position or visibility changes.

/** Tags are hidden at and below this CSS width (phones: chevrons and wordmark fill the bottom). */
export const TAG_MAX_WIDTH = 640
const OFFSET_X = 10
const OFFSET_Y = -14

export function tagFor(node: { tag?: string; designation: string }): string {
  return node.tag ?? node.designation.split(' · ')[0]
}

export function tagVisible(input: {
  id: string
  openId: string | null
  onScreen: boolean
  width: number
}): boolean {
  return input.onScreen && input.openId !== input.id && input.width > TAG_MAX_WIDTH
}

export interface Tags {
  update(camera: Camera): void
}

export function createTags(
  root: HTMLElement,
  nodes: Array<{ id: string; tag?: string; designation: string }>,
  position: (id: string) => Vector3,
  openId: () => string | null,
): Tags {
  const entries = nodes.map((node) => {
    const el = document.createElement('div')
    el.className = 'hud-tag'
    el.textContent = tagFor(node)
    el.setAttribute('aria-hidden', 'true')
    root.append(el)
    return { id: node.id, el, x: NaN, y: NaN, shown: true }
  })

  return {
    update(camera) {
      const open = openId()
      for (const entry of entries) {
        const s = toScreen(position(entry.id), camera, innerWidth, innerHeight)
        const visible = tagVisible({ id: entry.id, openId: open, onScreen: s.visible, width: innerWidth })
        if (visible !== entry.shown) {
          entry.el.hidden = !visible
          entry.shown = visible
        }
        if (!visible) continue
        const x = Math.round(s.x + OFFSET_X)
        const y = Math.round(s.y + OFFSET_Y)
        if (x !== entry.x || y !== entry.y) {
          entry.x = x
          entry.y = y
          entry.el.style.transform = `translate(${x}px, ${y}px)`
        }
      }
    },
  }
}
```

- [ ] **Step 5: Styles**

In `src/styles.css`, replace the `.hud-hint` position so it sits in the lower third:

```css
.hud-hint {
  position: fixed; z-index: 4; left: 50%; bottom: 96px;
  transform: translateX(-50%); text-align: center;
  pointer-events: none; user-select: none;
  font-size: 11px; letter-spacing: 2px; line-height: 2;
  color: var(--hud-accent); text-transform: uppercase;
  text-shadow: 0 0 12px rgba(140, 192, 255, 0.35);
  opacity: 0; transition: opacity 0.3s ease;
}
```

(the only change is `bottom: 96px` replacing `top: calc(50% + 13vh)`). In the `max-width: 640px` block change the `.hud-hint` rule to add `bottom: 176px;`, and in the landscape-phone block replace `top: calc(50% + 8vh);` with `bottom: 72px;`.

Add the tag style after `.hud-corner-br`:

```css
/* Beacon designation tags (desktop only) */
.hud-tag {
  position: fixed; left: 0; top: 0; z-index: 2; pointer-events: none; user-select: none;
  font-size: 9px; letter-spacing: 1.5px; line-height: 1;
  color: rgba(138, 163, 192, 0.7); text-transform: uppercase;
  text-shadow: 0 0 6px rgba(4, 6, 15, 0.9);
  will-change: transform;
}
.hud-tag[hidden] { display: none; }
@media (max-width: 640px) {
  .hud-tag { display: none; }
}
```

- [ ] **Step 6: Wire in main.ts**

After `createNodeNav(...)` in `src/main.ts`:

```ts
  const tags = createTags(
    document.getElementById('hud')!,
    NODES,
    (id) => beacons.worldPosition(id),
    hud.openId,
  )
```

(import `createTags` from `'./hud/tags'`), and in the frame callback after `interaction.update(dt)`: `tags.update(sceneCtx.camera)`.

- [ ] **Step 7: Run tests, build, e2e**

Run: `npm test && npm run build && npm run e2e`
Expected: green on both projects. In the browser: five dim tags ride beside the beacons, the open node's tag disappears while its panel is up, the hint types above the chevrons.

- [ ] **Step 8: Commit**

```bash
git add src/hud/tags.ts src/nodes/registry.ts src/main.ts src/styles.css tests/tags.test.ts tests/registry.test.ts e2e
git commit -m "feat: beacon designation tags, hint moved to the lower third"
```

---

### Task 12: Tune by eye, social card, docs, ship

**Files:**
- Modify: tuning constants listed below
- Modify: `docs/superpowers/specs/2026-09-12-galaxy-fidelity-2-design.md` (deviations section)
- Modify: `CLAUDE.md` (bindings), `public/og.png`

- [x] **Step 1: Capture the tuning set**

```bash
npm run build && (npx vite preview --port 4173 --strictPort &) && sleep 2
mkdir -p /tmp/look
node scripts/capture-look.mjs /tmp/look/load.png ""
node scripts/capture-look.mjs /tmp/look/zoom.png "" zoom
```

Read both. Check against the spec's success criteria: two arms with no ring-up; faint-to-bright stars with a few blooming giants; blue outer arms, gold-to-white core; peaked bulge with spill; a closest zoom that still reads as a galaxy; filamentary lanes with knots; beacons as stars; textured background. Adjust one constant at a time, recapture, and fill the table.

- [x] **Step 2: Constants table**

Fill the Final column as you go. Every value here is the tuning record for this round.

| Constant | File | Starting value | Final |
|---|---|---|---|
| `TONE_MAPPER` (Task 1 spike; note capture names and the reason) | src/render/post.ts | agx | neutral (Task 1 spike: agx-085/neutral-085/agx-110/neutral-110 captures; outer arms hold blue and the core rolls gold to pale under Neutral, grey/plateau under AgX) |
| `EXPOSURE` | src/render/post.ts | 0.85 | 0.85 (untouched) |
| `BLOOM.strength / radius / threshold` | src/render/post.ts | 0.3 / 0.6 / 1.0 | 0.3 / 0.6 / 1.0 (untouched; reads well) |
| `GRAIN` | src/render/post.ts | 1.5 | 1.5 (rework: the sin-based hash was replaced by interleaved gradient noise with a per-frame pixel offset; the sin hash bands diagonally on Apple GPUs) |
| `ORBIT.spin / wobble / pattern / eInner / eFalloff` | src/galaxy/orbit.ts | 0.95 / 0.1 / 0.02 / 0.35 / 0.5 | 1.7 / 0.1 / 0.02 / 0.55 / 0.5 (spin and eInner were the headline fix for the no-spiral problem; wobble/pattern/eFalloff untouched) |
| `ARM_POWER / ARM_SHIFT` | src/galaxy/shaders.ts | 3.0 / 0.0 | 3.0 / 0.0 (untouched; the spiral read clearly once spin/eInner/ARM_LUM/GLOW_ARM moved) |
| `STAR_INTENSITY` | src/galaxy/galaxy.ts | 0.6 | 0.6 (untouched) |
| `ARM_LUM / ARM_BLUE / TWINKLE` | src/galaxy/galaxy.ts | 0.8 / 0.6 / 0.15 | 1.0 / 0.6 / 0.15 (1.3 at ship; rework softened the hard white ridge) |
| `LUM_FLOOR / LUM_SCALE / GIANT_LUM` | src/galaxy/generate.ts | 0.15 / 1.0 / 3.0 | 0.15 / 1.0 / 3.0 (untouched) |
| `CLUSTER_LUM_FACTOR` (new; not in the spec's table) | src/galaxy/generate.ts | n/a | 0.6 (dims non-giant cluster members so a cluster reads as a sparkle, not a smear; see deviations) |
| `CLUSTER_PHASE_JITTER / CLUSTER_A_JITTER` (cluster knot shape) | src/galaxy/generate.ts | 0.06 / 0 | 0.06 / 0.12 (0.16 / 0 at ship: members on one exact orbit with a wide phase jitter formed one-dimensional arcs that read as bright diagonal streaks; the rework makes the knot round with a small a jitter) |
| `GALAXY_DEFAULTS.bulgeFraction / bulgeCoreShare / bulgeCoreSigma / bulgeHaloSigma` | src/galaxy/generate.ts | 0.12 / 0.35 / 0.3 / 2.5 | 0.12 / 0.35 / 0.3 / 1.4 (halo shrunk to kill the floating yellow blobs; kept in step with GLOW_DEFAULTS) |
| `PALETTE` | src/galaxy/generate.ts | round-one values | round-one values (untouched; reads well) |
| `GLOW_DEFAULTS.bulgeCoreShare / bulgeCoreSigma / bulgeHaloSigma / bulgeAlphaScale` | src/galaxy/glow.ts | 0.4 / 0.3 / 2.5 / 0.5 | 0.4 / 0.3 / 2.0 / 0.5 (1.4 at ship; rework widened the halo for the gas above the core) |
| glow bulge y-flatten factor (`* 0.6` in `generateGlow`; not a named param) | src/galaxy/glow.ts | 0.6 | 0.4 (0.35 at ship; rework) |
| `GLOW_ARM` | src/galaxy/glow.ts | 0.7 | 0.4 (0.85 at ship; the rework lowered it so the inter-arm gas of round one comes back) |
| `PROXIMITY.far / near / min` | src/galaxy/glow.ts | 7.0 / 5.5 / 0.45 | 7.0 / 5.5 / 0.45 (untouched) |
| `GLOW_INTENSITY`, `GLOW_DEFAULTS.alpha`, `GLOW_DEFAULTS.count` | src/galaxy/glow.ts | 0.8, 0.048, 5000 | 0.8, 0.115, 7000 (rework: more, lighter sprites for a continuous haze) |
| `GLOW_DEFAULTS.sizeMin / sizeMax` and glow atlas (rework) | src/galaxy/glow.ts | 0.12 / 0.36, gaussian discs | 0.1 / 0.42 with a rand^1.6 size skew (bulge instances 1.1x, was 1.5x); each sprite samples a cell of the procedural cloud atlas (`buildDustAtlas(128, 41)`) under a soft radial envelope, so gas reads as wisps, not spheres |
| `DUST_DEFAULTS.laneTilt / clumpFraction / alphaFloor / alphaPower / rotationJitter` | src/galaxy/dust.ts | 0.22 / 0.15 / 0.15 / 2.2 / 0.3 | 0.22 / 0.15 / 0.35 / 2.2 / 0.3 (alphaFloor 0.28 at ship, 0.35 after the rework) |
| `DUST_ABSORB`, `DUST_ARM` | src/galaxy/dust.ts | 0.65, 0.6 | 0.65, 0.3 (0.85 / 0.6 at ship; the rework lightened the inter-arm field, lanes sit on the concave side) |
| `BEACON_INTENSITY / BEACON_SIZE` | src/nodes/beacons.ts | 1.8 / 0.55 | 1.8 / 0.55 (untouched; reads well) |
| `STARFIELD_INTENSITY` | src/galaxy/starfield.ts | 0.5 | 0.5 (untouched) |
| `MAX_POLAR_DEG / MIN_DISTANCE` | src/camera/controls.ts | 12 / 5.5 | removed / 4 (rework: Bradley rejected the clamp and the smaller view; round one's limits restored) |
| `LADDER` glow/dust fractions at levels 2 to 4 (rework) | src/quality.ts | 0.5 / 0.5 | 0.75 / 0.75 |
| `DIRECT_PATH_SCALE` (new; not in the spec's table) | src/render/post.ts | n/a | 0.4 (whole-branch review: the direct path has no tone mapper, so the layers tuned for the HDR curve clipped the core and giants flat white; `final-direct-load.png` confirmed 0.4 keeps individual bulge stars visible with no flat white disc) |

- [x] **Step 3: Ten-minute check**

With the preview running, open `http://localhost:4173/?level=0` in a real browser, note SIM-T, and come back after ten minutes. The arm structure must be unchanged from load. If the inner disc has developed a ring or the arms have drifted apart, `ORBIT.pattern` and `eFalloff` are the levers (the pattern is stationary by construction; a visible change means a layer is not on the shared chunk, which is a bug to find, not a value to tune).

- [x] **Step 4: Social card**

```bash
node scripts/capture-og.mjs
```

Read `public/og.png` and confirm it shows the new look.

- [x] **Step 5: Docs**

- Spec: append to "Deviations accepted during the build": attribute names kept (`aRadius`/`aAngle` now mean a and phase); spurs retired; per-instance `aTilt` instead of a material uniform; the `?tone=` and `?exposure=` pins; anything else that changed from the spec during Tasks 1 to 11; the tone-mapping decision.
- CLAUDE.md bindings: add the round-two spec and plan lines under Bindings, mirroring the round-one entries; note that `scripts/capture-look.mjs` exists for tuning captures.
- Memory: update `galaxy-fidelity-round.md` in the memory directory with the new state (what shipped, remaining follow-ups, whether Linear was used).

- [x] **Step 6: Full verification**

Run: `npm test && npm run build && npm run e2e`
Expected: all green on chromium and firefox.

- [ ] **Step 7: Commit and ship**

Push and CI watch performed by the controller after the final review.

```bash
git add -A
git commit -m "feat: galaxy fidelity round two tuning, social card, docs"
git push origin main
gh run watch --repo bshandley/handleyio
```

Then spot-check https://handley.io on desktop and phone against the success criteria, and hand the by-eye check to Bradley.
