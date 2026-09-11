# Galaxy Visual Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the galaxy read as a photographic spiral: gold bulge, continuous glowing arms, brown dust lanes, temperature-colored background, no clipped white core.

**Architecture:** Every galaxy layer (resolved stars, glow, dust) samples one shared arm model and orbits on one shared GLSL orbit chunk, so the layers wind together. Stars split into below/above-plane draw ranges so dust (multiply blend) darkens only what is behind it. The scene renders into a half-float target through an EffectComposer chain (bloom, AgX tone mapping, vignette + dither) when float targets exist, else directly. A quality ladder drops bloom, then layer density, then stars.

**Tech Stack:** Vite, vanilla TypeScript, Three.js 0.184 (EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass from `three/addons`), Vitest, Playwright. No new dependencies.

**Spec:** docs/superpowers/specs/2026-09-10-galaxy-fidelity-design.md

## Global Constraints

- No em dashes anywhere (code, comments, commits, docs).
- The render loop allows zero per-frame allocations (repo CLAUDE.md). Per-frame work added by this plan: one sign test, renderOrder number assignments, `renderer.info.reset()`, uniform scalar writes, the composer's fixed pass list.
- The orbit curve `0.0875 / (0.3 + r)` lives in `orbitalSpeed()` (generate.ts), the GLSL `orbitChunk` (shaders.ts), and beacons.ts through `orbitalSpeed()`. They must stay identical.
- The no-WebGL fallback HTML in index.html is untouched.
- Node registry positions are data; galaxy and HUD code never special-case nodes.
- Colors in generated buffers stay in [0, 1]; brightness is a shader uniform.
- Every task: tests first, `npm test` green, commit. Commit messages end with the attribution lines given in the session's system reminder.
- This plan mirrors the code. When a value is tuned by eye in Task 10, update the constant here too.

**Design notes locked during planning:**

- The arm model is scale-free (positions in `t = r / radius`), created once per scene and passed to every generator, so spurs land in the same place for stars, glow, and dust. Generators take `(params, model, rand)`.
- Dust uses `CustomBlending` (`ZeroFactor`, `SrcColorFactor`) rather than three's `MultiplyBlending`, which in 0.184 requires premultiplied alpha and blends alpha into the result. Output is the per-channel transmission directly: `dst * src`.
- The starfield and deep field are two modules added to the scene separately; the spec's "returns a Group containing both" is dropped as needless (record as a deviation in Task 10).
- Bloom's mip chain starts at half the drawing-buffer size by UnrealBloomPass's own design, which is the spec's "half resolution".
- `renderer.info.reset()` runs immediately before the render, after the frame callbacks, so telemetry reads the previous full frame's draw count.

**Task ordering:** arm model, stars (generation, shaders, split), post chain, billboards, glow, dust, background, quality ladder, tune and ship. The post chain lands before the layers so each layer is judged under tone mapping.

---

### Task 1: Shared arm model and math helpers

**Files:**
- Create: `src/galaxy/math.ts`
- Create: `src/galaxy/arms.ts`
- Create: `tests/rng.ts`
- Test: `tests/arms.test.ts`

**Interfaces:**
- Produces: `lerp(a, b, t)`, `clamp01(v)`, `makeGauss(rand): () => number` (sum of three uniforms minus 1.5, sd 0.5) in math.ts.
- Produces: `ArmParams`, `ARM_DEFAULTS`, `ArmModel { params, spurs, ridgeAngle(arm, r), sample(arm, r, t, rand, gauss), laneAngle(arm, r, offset) }`, `createArmModel(params?, rand?)` in arms.ts.
- Produces: `mulberry(seed)` in tests/rng.ts (the same generator the existing tests inline).

- [ ] **Step 1: Write the test helper**

Create `tests/rng.ts`:

```ts
// Seeded rng for deterministic generation tests (same generator the older
// tests inline; new tests import it from here).
export function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/arms.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { makeGauss } from '../src/galaxy/math'
import { mulberry } from './rng'

describe('arm model', () => {
  it('is deterministic for a seeded rng', () => {
    const a = createArmModel(ARM_DEFAULTS, mulberry(7))
    const b = createArmModel(ARM_DEFAULTS, mulberry(7))
    expect(a.spurs).toEqual(b.spurs)
    expect(a.spurs).toHaveLength(ARM_DEFAULTS.arms * ARM_DEFAULTS.spurs)
  })

  it('advances the ridge by spin per unit radius, arms evenly spaced', () => {
    const m = createArmModel({ ...ARM_DEFAULTS, wobble: 0 }, mulberry(1))
    expect(m.ridgeAngle(0, 2) - m.ridgeAngle(0, 1)).toBeCloseTo(ARM_DEFAULTS.spin, 6)
    expect(m.ridgeAngle(1, 1) - m.ridgeAngle(0, 1)).toBeCloseTo(Math.PI, 6)
  })

  it('scatters samples around the ridge within the spread bound', () => {
    const m = createArmModel({ ...ARM_DEFAULTS, spurs: 0 }, mulberry(2))
    const rand = mulberry(3)
    const gauss = makeGauss(rand)
    const r = 2
    const t = r / 4.5
    const bound = 3 * 0.5 * (ARM_DEFAULTS.spread + t * ARM_DEFAULTS.spreadGrowth)
    let sumAbs = 0
    for (let i = 0; i < 2000; i++) {
      const d = m.sample(0, r, t, rand, gauss) - m.ridgeAngle(0, r)
      expect(Math.abs(d)).toBeLessThanOrEqual(bound * 1.01)
      sumAbs += Math.abs(d)
    }
    expect(sumAbs / 2000).toBeLessThan(bound / 2)
  })

  it('spur samples diverge from the ridge only inside the spur window', () => {
    const p = { ...ARM_DEFAULTS, spurs: 1, spread: 0, spreadGrowth: 0 }
    const m = createArmModel(p, mulberry(4))
    const rand = mulberry(5)
    const gauss = makeGauss(rand)
    const spur = m.spurs[0]
    const before = spur.root - 0.05
    for (let i = 0; i < 50; i++) {
      expect(m.sample(spur.arm, before * 4.5, before, rand, gauss)).toBeCloseTo(
        m.ridgeAngle(spur.arm, before * 4.5),
        6,
      )
    }
    const inside = spur.root + p.spurLength / 2
    let diverged = 0
    for (let i = 0; i < 50; i++) {
      const d = m.sample(spur.arm, inside * 4.5, inside, rand, gauss) - m.ridgeAngle(spur.arm, inside * 4.5)
      if (Math.abs(d) > 1e-6) {
        diverged++
        expect(Math.sign(d)).toBe(spur.sign)
      }
    }
    expect(diverged).toBeGreaterThan(0)
  })

  it('lane angle sits a world-unit offset off the ridge toward the concave side', () => {
    const m = createArmModel(ARM_DEFAULTS, mulberry(6))
    expect(m.laneAngle(0, 2, 0.2)).toBeCloseTo(m.ridgeAngle(0, 2) - 0.1, 6)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/arms.test.ts`
Expected: FAIL (cannot resolve `../src/galaxy/arms`).

- [ ] **Step 4: Write math.ts**

Create `src/galaxy/math.ts`:

```ts
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Approximately normal, sd 0.5: sum of three uniforms minus 1.5. */
export function makeGauss(rand: () => number): () => number {
  return () => rand() + rand() + rand() - 1.5
}
```

- [ ] **Step 5: Write arms.ts**

Create `src/galaxy/arms.ts`:

```ts
// The spiral arm model shared by every galaxy layer (resolved stars, glow,
// dust). Layers sample the same ridges and spurs, so they wind together
// under the differential rotation in shaders.ts. Scale-free: spur windows
// are in t = r / radius; ridge angles use world-unit radius like before.

export interface ArmParams {
  arms: number
  /** Ridge angle advance per world unit of radius (radians). */
  spin: number
  /** Sinusoidal ridge perturbation amplitude (radians). */
  wobble: number
  /** Gaussian angular scatter about the ridge at t = 0 (radians). */
  spread: number
  /** Additional scatter at t = 1 (radians). */
  spreadGrowth: number
  /** Spurs per arm. */
  spurs: number
  /** Radial extent of a spur, in t units. */
  spurLength: number
  /** Angular divergence per t unit along a spur (radians). */
  spurSlope: number
}

export const ARM_DEFAULTS: ArmParams = {
  arms: 2,
  spin: 0.95,
  wobble: 0.1,
  spread: 0.14,
  spreadGrowth: 0.45,
  spurs: 3,
  spurLength: 0.3,
  spurSlope: 0.9,
}

export interface Spur {
  arm: number
  /** Root radius in t units. */
  root: number
  sign: 1 | -1
}

export interface ArmModel {
  params: ArmParams
  spurs: Spur[]
  ridgeAngle(arm: number, r: number): number
  /** Angle of a star scattered about the ridge of `arm` at radius r (t = r / radius). */
  sample(arm: number, r: number, t: number, rand: () => number, gauss: () => number): number
  /** Ridge angle shifted `offset` world units toward the concave side (dust lanes). */
  laneAngle(arm: number, r: number, offset: number): number
}

export function createArmModel(
  p: ArmParams = ARM_DEFAULTS,
  rand: () => number = Math.random,
): ArmModel {
  const spurs: Spur[] = []
  for (let arm = 0; arm < p.arms; arm++) {
    for (let s = 0; s < p.spurs; s++) {
      spurs.push({ arm, root: 0.2 + 0.6 * rand(), sign: rand() < 0.5 ? -1 : 1 })
    }
  }

  const ridgeAngle = (arm: number, r: number) =>
    (arm / p.arms) * Math.PI * 2 + r * p.spin + p.wobble * Math.sin(r * 3.1 + arm * 1.9)

  return {
    params: p,
    spurs,
    ridgeAngle,
    sample(arm, r, t, rand, gauss) {
      let a = ridgeAngle(arm, r) + gauss() * (p.spread + t * p.spreadGrowth)
      // half the samples inside a spur's radial window follow it off the ridge
      for (const s of spurs) {
        if (s.arm !== arm) continue
        const d = t - s.root
        if (d > 0 && d < p.spurLength && rand() < 0.5) {
          a += s.sign * p.spurSlope * d
          break
        }
      }
      return a
    },
    laneAngle(arm, r, offset) {
      return ridgeAngle(arm, r) - offset / Math.max(0.3, r)
    },
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/arms.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/galaxy/math.ts src/galaxy/arms.ts tests/rng.ts tests/arms.test.ts
git commit -m "feat: shared spiral arm model with spurs"
```

---

### Task 2: Star generation v2 (bulge, palette, spikes, y-sort)

**Files:**
- Modify: `src/galaxy/generate.ts` (full rewrite)
- Modify: `tests/generate.test.ts`

**Interfaces:**
- Consumes: `ArmModel`, `makeGauss`, `lerp`, `clamp01` from Task 1.
- Produces: `Rgb`, `Palette`, `PALETTE`, `GalaxyParams { count, radius, thickness, bulgeRadius, bulgeFlatten, bulgeFraction, palette }`, `GALAXY_DEFAULTS`, `orbitalSpeed(r)` (unchanged), `paletteAt(palette, t): Rgb`, `GalaxyBuffers { radius, angle, y, color, size, spike, splitIndex }`, `generateGalaxy(p, model, rand?)`. Buffers are sorted by y; entries `[0, splitIndex)` have `y < 0`.

- [ ] **Step 1: Replace the test file**

Replace the full contents of `tests/generate.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { generateGalaxy, GALAXY_DEFAULTS, PALETTE, paletteAt } from '../src/galaxy/generate'
import { mulberry } from './rng'

describe('generateGalaxy', () => {
  const model = createArmModel(ARM_DEFAULTS, mulberry(1))
  const g = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, model, mulberry(42))

  it('produces buffers sized to count', () => {
    expect(g.radius).toHaveLength(5000)
    expect(g.angle).toHaveLength(5000)
    expect(g.y).toHaveLength(5000)
    expect(g.size).toHaveLength(5000)
    expect(g.spike).toHaveLength(5000)
    expect(g.color).toHaveLength(15000)
  })

  it('keeps radii within the soft-edge bound (1.2x nominal radius)', () => {
    for (const r of g.radius) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(GALAXY_DEFAULTS.radius * 1.2)
    }
  })

  it('has a fuzzy edge: some stars past the nominal radius', () => {
    let beyond = 0
    for (const r of g.radius) if (r > GALAXY_DEFAULTS.radius) beyond++
    expect(beyond).toBeGreaterThan(0)
  })

  it('keeps colors in [0, 1]', () => {
    for (const c of g.color) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for a seeded rng', () => {
    const h = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, model, mulberry(42))
    expect(h.radius[123]).toBe(g.radius[123])
    expect(h.splitIndex).toBe(g.splitIndex)
  })

  it('is sorted by y with splitIndex at the sign change', () => {
    for (let i = 1; i < g.y.length; i++) expect(g.y[i]).toBeGreaterThanOrEqual(g.y[i - 1])
    for (let i = 0; i < g.splitIndex; i++) expect(g.y[i]).toBeLessThan(0)
    for (let i = g.splitIndex; i < g.y.length; i++) expect(g.y[i]).toBeGreaterThanOrEqual(0)
    expect(g.splitIndex).toBeGreaterThan(1000)
    expect(g.splitIndex).toBeLessThan(4000)
  })

  it('populates a bulge at the center', () => {
    let inner = 0
    for (const r of g.radius) if (r < GALAXY_DEFAULTS.bulgeRadius) inner++
    expect(inner / g.radius.length).toBeGreaterThan(0.05)
  })

  it('flags a small minority of stars as spiked giants', () => {
    let spiked = 0
    for (const s of g.spike) {
      expect(s === 0 || s === 1).toBe(true)
      if (s === 1) spiked++
    }
    expect(spiked).toBeGreaterThan(0)
    expect(spiked / g.spike.length).toBeLessThan(0.1)
  })
})

describe('paletteAt', () => {
  it('returns the stops at their positions and blends between', () => {
    expect(paletteAt(PALETTE, 0)).toEqual(PALETTE[0])
    expect(paletteAt(PALETTE, 1)).toEqual(PALETTE[3])
    const mid = paletteAt(PALETTE, 1 / 6)
    for (let c = 0; c < 3; c++) expect(mid[c]).toBeCloseTo((PALETTE[0][c] + PALETTE[1][c]) / 2, 6)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/generate.test.ts`
Expected: FAIL (no export `PALETTE`, `paletteAt`; signature mismatch).

- [ ] **Step 3: Rewrite generate.ts**

Replace the full contents of `src/galaxy/generate.ts` with:

```ts
import type { ArmModel } from './arms'
import { clamp01, lerp, makeGauss } from './math'

export type Rgb = [number, number, number]
/** Radial color stops at t = 0, 1/3, 2/3, 1. */
export type Palette = [Rgb, Rgb, Rgb, Rgb]

export const PALETTE: Palette = [
  [1.0, 0.82, 0.55], // old gold bulge
  [1.0, 0.94, 0.85], // warm white inner disc
  [0.82, 0.88, 1.0], // blue-white
  [0.5, 0.62, 1.0], // blue edge
]

export interface GalaxyParams {
  count: number
  radius: number
  thickness: number
  /** In-plane sigma of the bulge ellipsoid (world units). */
  bulgeRadius: number
  /** y sigma as a fraction of bulgeRadius. */
  bulgeFlatten: number
  /** Share of count placed in the bulge. */
  bulgeFraction: number
  palette: Palette
}

export const GALAXY_DEFAULTS: GalaxyParams = {
  count: 60_000,
  radius: 4.5,
  thickness: 0.35,
  bulgeRadius: 0.55,
  bulgeFlatten: 0.6,
  bulgeFraction: 0.18,
  palette: PALETTE,
}

// Differential rotation curve. The GLSL orbitChunk in shaders.ts inlines the
// same constants; keep them in sync.
export function orbitalSpeed(radius: number): number {
  return 0.0875 / (0.3 + radius)
}

export function paletteAt(palette: Palette, t: number): Rgb {
  const x = clamp01(t) * 3
  const i = Math.min(2, Math.floor(x))
  const f = x - i
  const a = palette[i]
  const b = palette[i + 1]
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]
}

export interface GalaxyBuffers {
  radius: Float32Array
  angle: Float32Array
  y: Float32Array
  color: Float32Array
  size: Float32Array
  /** 1 for bright giants drawn with diffraction spikes, else 0. */
  spike: Float32Array
  /** Buffers are sorted by y; entries [0, splitIndex) have y < 0. */
  splitIndex: number
}

// Population mix, tuned by eye against the preview
const CLUMP_FRACTION = 0.15 // star-forming clusters along the arms
const FIELD_FRACTION = 0.08 // unstructured disc/halo stars
const BRIGHT_GIANT_CUTOFF = 0.8 // of the size power law; ~5% of disc stars

export function generateGalaxy(
  p: GalaxyParams,
  model: ArmModel,
  rand: () => number = Math.random,
): GalaxyBuffers {
  const n = p.count
  const radius = new Float32Array(n)
  const angle = new Float32Array(n)
  const y = new Float32Array(n)
  const color = new Float32Array(n * 3)
  const size = new Float32Array(n)
  const spike = new Float32Array(n)
  const gauss = makeGauss(rand)
  const arms = model.params.arms

  // Star-forming clumps seeded along the arm ridges
  const clusterCount = Math.max(8, Math.round(n / 1500))
  const clusters: Array<{ r: number; a: number; y: number }> = []
  for (let c = 0; c < clusterCount; c++) {
    const r = (0.25 + 0.75 * Math.pow(rand(), 1.5)) * p.radius
    clusters.push({
      r,
      a: model.ridgeAngle(c % arms, r) + gauss() * 0.12,
      y: gauss() * p.thickness * 0.4,
    })
  }

  for (let i = 0; i < n; i++) {
    const roll = rand()
    const inBulge = roll < p.bulgeFraction
    const inClump = !inBulge && roll < p.bulgeFraction + CLUMP_FRACTION
    const inField = !inBulge && !inClump && roll < p.bulgeFraction + CLUMP_FRACTION + FIELD_FRACTION
    let r: number
    let a: number
    let yy: number

    if (inBulge) {
      // old population: gaussian ellipsoid, flattened in y
      const gx = gauss() * 2 * p.bulgeRadius
      const gz = gauss() * 2 * p.bulgeRadius
      r = Math.hypot(gx, gz)
      a = Math.atan2(gz, gx)
      yy = gauss() * 2 * p.bulgeRadius * p.bulgeFlatten
    } else if (inClump) {
      const c = clusters[Math.floor(rand() * clusters.length)]
      r = c.r + gauss() * 0.18
      a = c.a + (gauss() * 0.12) / Math.max(0.4, c.r * 0.5)
      yy = c.y + gauss() * p.thickness * 0.25
    } else if (inField) {
      r = Math.sqrt(rand()) * p.radius
      a = rand() * Math.PI * 2
      yy = gauss() * p.thickness * (1.6 - r / p.radius)
    } else {
      // arm population, kept out of the bulge core
      r = (0.12 + 0.88 * Math.pow(rand(), 1.7)) * p.radius
      const t = r / p.radius
      a = model.sample(i % arms, r, t, rand, gauss)
      yy = gauss() * p.thickness * (1.0 - 0.75 * t)
    }

    // fuzzy edge: gaussian radial jitter, stronger outward, soft cap at 1.2x
    if (!inBulge) r += gauss() * 0.15 * (0.3 + r / p.radius)
    r = Math.min(1.2 * p.radius, Math.max(0, r))
    const t = Math.min(1, r / p.radius)
    radius[i] = r
    angle[i] = a
    y[i] = yy

    let [cr, cg, cb] = inBulge ? p.palette[0] : paletteAt(p.palette, t)

    // per-star temperature shift along a blackbody-ish warm/cool axis:
    // green moves with red (toward yellow-white) so nothing turns magenta
    const temp = (rand() - 0.5) * 0.24
    cr += temp
    cg += temp * 0.35
    cb -= temp

    // star-forming clumps skew young and blue-white
    if (inClump) {
      cb += 0.08
      cr -= 0.04
    }

    const jitter = 0.8 + rand() * 0.3

    // power-law sizes: mostly small, a handful of bright giants that wash
    // evenly toward white. The bulge is an old population with no giants.
    const s = Math.pow(rand(), inBulge ? 6 : 4)
    const giant = !inBulge && s > BRIGHT_GIANT_CUTOFF
    size[i] = (0.6 + s * 4.5) * (inBulge ? 1.2 : 1.0)
    spike[i] = giant ? 1 : 0
    const brighten = giant ? 1.4 : 1.0

    color[i * 3] = clamp01(cr * jitter * brighten)
    color[i * 3 + 1] = clamp01(cg * jitter * brighten)
    color[i * 3 + 2] = clamp01(cb * jitter * brighten)
  }

  return sortByY({ radius, angle, y, color, size, spike })
}

// Sort every buffer by y so galaxy.ts can draw the below-plane half and the
// above-plane half as two draw ranges around the dust layer.
function sortByY(b: Omit<GalaxyBuffers, 'splitIndex'>): GalaxyBuffers {
  const n = b.y.length
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  order.sort((i, j) => b.y[i] - b.y[j])

  const permute = (src: Float32Array) => {
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = src[order[i]]
    return out
  }
  const color = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const j = order[i]
    color[i * 3] = b.color[j * 3]
    color[i * 3 + 1] = b.color[j * 3 + 1]
    color[i * 3 + 2] = b.color[j * 3 + 2]
  }
  const y = permute(b.y)
  let splitIndex = 0
  while (splitIndex < n && y[splitIndex] < 0) splitIndex++

  return {
    radius: permute(b.radius),
    angle: permute(b.angle),
    y,
    color,
    size: permute(b.size),
    spike: permute(b.spike),
    splitIndex,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/generate.test.ts`
Expected: PASS, 9 tests. `npm run build` will fail until Task 3 updates galaxy.ts (it still calls the old signature); that is expected at this commit.

- [ ] **Step 5: Commit**

```bash
git add src/galaxy/generate.ts tests/generate.test.ts
git commit -m "feat: star generation with bulge, gold-to-blue palette, spikes, y-sorted split"
```

---

### Task 3: Star shaders, split draw ranges, render order

**Files:**
- Create: `src/galaxy/order.ts`
- Modify: `src/galaxy/shaders.ts` (full rewrite)
- Modify: `src/galaxy/galaxy.ts` (full rewrite)
- Modify: `src/scene.ts:2-3,33-35,75-86`
- Modify: `src/main.ts:23-24`
- Test: `tests/galaxy.test.ts`

**Interfaces:**
- Consumes: `generateGalaxy(p, model, rand)`, `GalaxyBuffers.splitIndex`, `createArmModel`.
- Produces: `RENDER_ORDER = { background: 0, glow: 1, farStars: 2, dust: 3, nearStars: 4, beacons: 5 }`; `orbitChunk` and `starProfileChunk` GLSL strings (declares uniforms `uTime`, `uOrbit` and functions `orbitPosition(radius, angle0, y)`, `starCore(p)`, `starSpikes(p)`); `Galaxy { group, below, above, setTime, setPixelRatio, setCameraSide, rebuild, dispose }`; `createGalaxy(model, overrides?, pixelRatio?, rand?)`.

- [ ] **Step 1: Write the failing test**

Create `tests/galaxy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { createGalaxy } from '../src/galaxy/galaxy'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('galaxy split', () => {
  const model = createArmModel(ARM_DEFAULTS, mulberry(1))
  const galaxy = createGalaxy(model, { count: 2000 }, 1, mulberry(2))

  it('covers every star across the below and above draw ranges', () => {
    const below = galaxy.below.geometry.drawRange
    const above = galaxy.above.geometry.drawRange
    expect(below.start).toBe(0)
    expect(above.start).toBe(below.count)
    expect(below.count + above.count).toBe(2000)
    expect(below.count).toBeGreaterThan(0)
    expect(above.count).toBeGreaterThan(0)
  })

  it('shares one attribute buffer between the halves', () => {
    expect(galaxy.below.geometry.attributes.aRadius).toBe(galaxy.above.geometry.attributes.aRadius)
    expect(galaxy.group.children).toHaveLength(2)
  })

  it('orders the far half before the dust and the near half after', () => {
    galaxy.setCameraSide(true)
    expect(galaxy.below.renderOrder).toBe(RENDER_ORDER.farStars)
    expect(galaxy.above.renderOrder).toBe(RENDER_ORDER.nearStars)
    galaxy.setCameraSide(false)
    expect(galaxy.below.renderOrder).toBe(RENDER_ORDER.nearStars)
    expect(galaxy.above.renderOrder).toBe(RENDER_ORDER.farStars)
    expect(RENDER_ORDER.farStars).toBeLessThan(RENDER_ORDER.dust)
    expect(RENDER_ORDER.dust).toBeLessThan(RENDER_ORDER.nearStars)
  })

  it('rebuild keeps the split consistent', () => {
    galaxy.rebuild(1000)
    const below = galaxy.below.geometry.drawRange
    const above = galaxy.above.geometry.drawRange
    expect(below.count + above.count).toBe(1000)
    expect(galaxy.below.geometry.attributes.aRadius.count).toBe(1000)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/galaxy.test.ts`
Expected: FAIL (cannot resolve `../src/galaxy/order`).

- [ ] **Step 3: Create order.ts**

Create `src/galaxy/order.ts`:

```ts
// Draw order of the scene layers. Dust multiplies what is already in the
// framebuffer, so it must sit between the far-side and near-side stars.
// Three sorts transparent objects by renderOrder before depth.
export const RENDER_ORDER = {
  background: 0,
  glow: 1,
  farStars: 2,
  dust: 3,
  nearStars: 4,
  beacons: 5,
} as const
```

- [ ] **Step 4: Rewrite shaders.ts**

Replace the full contents of `src/galaxy/shaders.ts` with:

```ts
// Shared GLSL chunks. orbitChunk mirrors orbitalSpeed() in generate.ts
// (beacons orbit with it on the CPU); keep the constants in sync.
export const orbitChunk = /* glsl */ `
uniform float uTime;
uniform float uOrbit;

vec3 orbitPosition(float radius, float angle0, float y) {
  float speed = 0.0875 / (0.3 + radius);
  float angle = angle0 + uTime * speed * uOrbit;
  return vec3(cos(angle) * radius, y, sin(angle) * radius);
}
`

// Point-sprite star profile. p is gl_PointCoord - 0.5. A tight core plus a
// faint wide halo, killed at the sprite edge so large points never show a
// square border under additive blending.
export const starProfileChunk = /* glsl */ `
float starCore(vec2 p) {
  float d2 = dot(p, p);
  float edge = 1.0 - smoothstep(0.4, 0.5, sqrt(d2));
  return (exp(-d2 * 60.0) + 0.10 * exp(-d2 * 8.0)) * edge;
}

float starSpikes(vec2 p) {
  float reach = max(0.0, 1.0 - length(p) * 2.0);
  return 0.35 * reach * reach * (exp(-abs(p.y) * 90.0) + exp(-abs(p.x) * 90.0));
}
`

// Spiked stars get a 2.5x sprite so the cross has room; the fragment shader
// scales the core back down. The constant appears in both shaders below.
export const galaxyVertex =
  orbitChunk +
  /* glsl */ `
uniform float uSize;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute float aSpike;
attribute vec3 aColor;
varying vec3 vColor;
varying float vSpike;

void main() {
  vec4 mv = modelViewMatrix * vec4(orbitPosition(aRadius, aAngle, aY), 1.0);
  gl_Position = projectionMatrix * mv;
  float px = uSize * aSize / max(0.001, -mv.z);
  gl_PointSize = aSpike > 0.5 ? px * 2.5 : px;
  vColor = aColor;
  vSpike = aSpike;
}
`

export const galaxyFragment =
  starProfileChunk +
  /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
varying float vSpike;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float alpha = vSpike > 0.5 ? starCore(p * 2.5) + starSpikes(p) : starCore(p);
  gl_FragColor = vec4(vColor * uIntensity, alpha);
}
`
```

- [ ] **Step 5: Rewrite galaxy.ts**

Replace the full contents of `src/galaxy/galaxy.ts` with:

```ts
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
import { galaxyFragment, galaxyVertex } from './shaders'

export const STAR_INTENSITY = 0.75
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
      uTime: { value: 0 },
      uOrbit: { value: 1 },
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
```

- [ ] **Step 6: Wire scene.ts and main.ts**

In `src/scene.ts`, change the imports at lines 2-3 to:

```ts
import { createArmModel } from './galaxy/arms'
import { createGalaxy, type Galaxy } from './galaxy/galaxy'
import { createStarfield } from './galaxy/starfield'
```

Replace lines 33-35 (`const galaxy = createGalaxy(...)` through `scene.add(createStarfield())`) with:

```ts
  const model = createArmModel()
  const galaxy = createGalaxy(model, { count: particleCount }, renderer.getPixelRatio())
  scene.add(galaxy.group)
  scene.add(createStarfield())
```

In `tick()`, directly after `galaxy.setTime(elapsed)`'s enclosing `if` block and before the frame callbacks loop, add:

```ts
    galaxy.setCameraSide(camera.position.y >= 0)
```

In `src/main.ts`, after `const beacons = createBeacons(NODES)` (line 23) add:

```ts
  beacons.group.renderOrder = RENDER_ORDER.beacons
```

and add the import `import { RENDER_ORDER } from './galaxy/order'` with the other imports.

- [ ] **Step 7: Run tests and build**

Run: `npm test && npm run build`
Expected: all vitest files pass (existing plus arms, generate, galaxy); tsc clean; vite build succeeds.

- [ ] **Step 8: Look at it**

Run: `npm run dev`, open the URL. Expected: a two-armed galaxy with a gold center, spiked giants, the rest as before. The core will still clip white until Task 4. Nothing else changed.

- [ ] **Step 9: Commit**

```bash
git add src/galaxy/order.ts src/galaxy/shaders.ts src/galaxy/galaxy.ts src/scene.ts src/main.ts tests/galaxy.test.ts
git commit -m "feat: star profile with spikes, plane-split draw ranges, layer render order"
```

---

### Task 4: HDR post chain (AgX, bloom, finish pass) with direct fallback

**Files:**
- Create: `src/render/post.ts`
- Modify: `src/scene.ts` (post integration, info reset, `__renderPath`)
- Test: `tests/post.test.ts`
- Test: `e2e/smoke.spec.ts` (two new tests)

**Interfaces:**
- Produces: `RenderPath = 'hdr' | 'direct'`; `hdrSupported(has: (name: string) => boolean): boolean`; `PostChain { path, render(), setSize(width, height, pixelRatio), setBloom(on), dispose() }`; `createPost(renderer, scene, camera, width, height): PostChain`; constants `EXPOSURE`, `BLOOM`, `VIGNETTE`; `finishShader`.
- Produces: `window.__renderPath` (test hook), `GalaxyScene.post`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/post.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { finishShader, hdrSupported } from '../src/render/post'

describe('hdrSupported', () => {
  it('is false without float color buffers', () => {
    expect(hdrSupported(() => false)).toBe(false)
  })
  it('is true with either float extension', () => {
    expect(hdrSupported((n) => n === 'EXT_color_buffer_float')).toBe(true)
    expect(hdrSupported((n) => n === 'EXT_color_buffer_half_float')).toBe(true)
  })
})

describe('finishShader', () => {
  it('samples tDiffuse and exposes the vignette uniform', () => {
    expect(finishShader.uniforms.tDiffuse.value).toBeNull()
    expect(finishShader.uniforms.uVignette.value).toBeGreaterThan(0)
    expect(finishShader.fragmentShader).toContain('tDiffuse')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/post.test.ts`
Expected: FAIL (cannot resolve `../src/render/post`).

- [ ] **Step 3: Write post.ts**

Create `src/render/post.ts`:

```ts
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
```

- [ ] **Step 4: Run the unit test**

Run: `npx vitest run tests/post.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Integrate into scene.ts**

In `src/scene.ts`:

Add the import:

```ts
import { createPost, type PostChain } from './render/post'
```

Add `post: PostChain` to the `GalaxyScene` interface (after `galaxy: Galaxy`).

After `container.appendChild(renderer.domElement)`, add:

```ts
  // Telemetry reads info.render.calls once per frame; with a post chain each
  // pass would otherwise reset it, leaving only the last pass's count.
  renderer.info.autoReset = false
```

After `scene.add(createStarfield())`, add:

```ts
  const post = createPost(renderer, scene, camera, innerWidth, innerHeight)
  window.__renderPath = post.path
```

Replace the resize listener body so it uses the post chain:

```ts
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    post.setSize(innerWidth, innerHeight, renderer.getPixelRatio())
  })
```

In `tick()`, replace `renderer.render(scene, camera)` with:

```ts
    renderer.info.reset()
    post.render()
```

Add `post` to the returned object. Add `__renderPath?: 'hdr' | 'direct'` to the `Window` interface declaration at the bottom of the file.

- [ ] **Step 6: Add the e2e tests**

Append to `e2e/smoke.spec.ts`:

```ts
test('renders through the direct path when float targets are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension
    WebGL2RenderingContext.prototype.getExtension = function (name: string) {
      if (name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float') return null
      return original.call(this, name)
    }
  })
  await page.goto('/')
  await expect(page.locator('#fallback')).toBeHidden()
  expect(await page.evaluate(() => window.__renderPath)).toBe('direct')
  const frames = async () => page.evaluate(() => window.__frameCount ?? 0)
  const before = await frames()
  await expect.poll(frames, { timeout: 5000 }).toBeGreaterThan(before)
})

test('telemetry draw count covers the whole frame on the hdr path', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const path = await page.evaluate(() => window.__renderPath)
  test.skip(path !== 'hdr', 'software GL without float color buffers')
  const drawCount = async () => {
    const text = await page.locator('.hud-tele-tr .hud-tele-line').nth(2).textContent()
    return Number((text ?? '').replace(/\D/g, ''))
  }
  // pre-change scene was 7 draw calls; the composer's passes push it well past that
  await expect.poll(drawCount, { timeout: 5000 }).toBeGreaterThan(7)
})
```

`window.__renderPath` and `window.__frameCount` are declared in `src/scene.ts`; the e2e tsconfig already sees them through the existing `__frameCount` usage.

- [ ] **Step 7: Run everything**

Run: `npm test && npm run build && npm run e2e -- --project=chromium`
Expected: vitest green; build clean; the Chromium e2e project passes including the two new tests (the hdr one may skip on a machine whose GL lacks float buffers, which is fine).

- [ ] **Step 8: Look at it**

Run: `npm run dev`. Expected: the core rolls off to a pale gold-white instead of a hard plateau; bright giants and beacons bloom softly; corners slightly darker. If the whole image is dim or blown out, adjust `EXPOSURE` (0.6 to 1.6 is the plausible range) and note the value in Task 10's table.

- [ ] **Step 9: Commit**

```bash
git add src/render/post.ts src/scene.ts tests/post.test.ts e2e/smoke.spec.ts
git commit -m "feat: half-float render target, AgX tone mapping, bloom, finish pass"
```

---

### Task 5: Instanced billboard geometry and vertex chunk

**Files:**
- Create: `src/galaxy/billboard.ts`
- Test: `tests/billboard.test.ts`

**Interfaces:**
- Consumes: `orbitChunk` from shaders.ts.
- Produces: `BillboardBuffers { radius, angle, y, size, rotation, shape, color, alpha }` (all Float32Array; color is rgb triplets); `allocBillboards(count)`; `createBillboardGeometry(buffers, boundingRadius): InstancedBufferGeometry`; `setInstanceFraction(geometry, fraction)`; `billboardVertex` GLSL (uniforms `uTime`, `uOrbit`, `uViewport`, `uMaxPx`, `uNearFade`; varyings `vUv`, `vColor`, `vAlpha`, `vShape`); `billboardUniforms(width, height)` returning the shared uniform set.

- [ ] **Step 1: Write the failing test**

Create `tests/billboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  allocBillboards,
  billboardUniforms,
  billboardVertex,
  createBillboardGeometry,
  setInstanceFraction,
} from '../src/galaxy/billboard'

describe('billboard geometry', () => {
  const buffers = allocBillboards(10)
  const geometry = createBillboardGeometry(buffers, 5)

  it('draws one quad per instance', () => {
    expect(geometry.instanceCount).toBe(10)
    expect(geometry.index?.count).toBe(6)
    expect(geometry.attributes.position.count).toBe(4)
    expect(geometry.attributes.aRadius.count).toBe(10)
    expect(geometry.attributes.aColor.itemSize).toBe(3)
  })

  it('setInstanceFraction trims the instance count without touching buffers', () => {
    setInstanceFraction(geometry, 0.5)
    expect(geometry.instanceCount).toBe(5)
    setInstanceFraction(geometry, 0)
    expect(geometry.instanceCount).toBe(0)
    setInstanceFraction(geometry, 2)
    expect(geometry.instanceCount).toBe(10)
    expect(geometry.attributes.aRadius.count).toBe(10)
  })

  it('vertex shader orbits and caps screen size', () => {
    expect(billboardVertex).toContain('orbitPosition(')
    expect(billboardVertex).toContain('uMaxPx')
    expect(billboardVertex).toContain('uNearFade')
  })

  it('uniform set sizes the cap from the viewport height', () => {
    const u = billboardUniforms(800, 600)
    expect(u.uViewport.value.x).toBe(800)
    expect(u.uMaxPx.value).toBe(300)
    expect(u.uOrbit.value).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/billboard.test.ts`
Expected: FAIL (cannot resolve `../src/galaxy/billboard`).

- [ ] **Step 3: Write billboard.ts**

Create `src/galaxy/billboard.ts`:

```ts
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/billboard.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/galaxy/billboard.ts tests/billboard.test.ts
git commit -m "feat: instanced billboard geometry and orbiting vertex chunk"
```

---

### Task 6: Glow layer (unresolved light and bulge)

**Files:**
- Create: `src/galaxy/glow.ts`
- Modify: `src/scene.ts` (add the layer, drive `setTime`/`setViewport`)
- Test: `tests/glow.test.ts`

**Interfaces:**
- Consumes: `ArmModel`, `BillboardBuffers`, `allocBillboards`, `createBillboardGeometry`, `setInstanceFraction`, `billboardUniforms`, `billboardVertex`, `paletteAt`, `PALETTE`, `makeGauss`, `lerp`, `RENDER_ORDER`.
- Produces: `GlowParams`, `GLOW_DEFAULTS`, `generateGlow(p, model, rand?)`, `GlowLayer { mesh, setTime(t), setViewport(w, h), setFraction(f), dispose() }`, `createGlow(model, width, height, overrides?, rand?)`.

- [ ] **Step 1: Write the failing test**

Create `tests/glow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { createGlow, generateGlow, GLOW_DEFAULTS } from '../src/galaxy/glow'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateGlow', () => {
  const model = createArmModel(ARM_DEFAULTS, mulberry(1))
  const g = generateGlow({ ...GLOW_DEFAULTS, count: 1000 }, model, mulberry(9))

  it('sizes buffers to count', () => {
    expect(g.radius).toHaveLength(1000)
    expect(g.color).toHaveLength(3000)
  })

  it('stays inside the soft edge with sizes in range and alpha in (0, 1]', () => {
    for (let i = 0; i < 1000; i++) {
      expect(g.radius[i]).toBeLessThanOrEqual(GLOW_DEFAULTS.radius * 1.2)
      expect(g.size[i]).toBeGreaterThanOrEqual(GLOW_DEFAULTS.sizeMin)
      expect(g.size[i]).toBeLessThanOrEqual(GLOW_DEFAULTS.sizeMax * 1.5)
      expect(g.alpha[i]).toBeGreaterThan(0)
      expect(g.alpha[i]).toBeLessThanOrEqual(1)
    }
    for (const c of g.color) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('places a bulge population near the center', () => {
    let inner = 0
    for (const r of g.radius) if (r < GLOW_DEFAULTS.bulgeRadius * 2) inner++
    expect(inner / 1000).toBeGreaterThan(GLOW_DEFAULTS.bulgeFraction * 0.6)
  })
})

describe('createGlow', () => {
  it('builds an additive mesh in the glow render slot', () => {
    const model = createArmModel(ARM_DEFAULTS, mulberry(1))
    const layer = createGlow(model, 800, 600, { count: 200 }, mulberry(3))
    expect(layer.mesh.renderOrder).toBe(RENDER_ORDER.glow)
    expect(layer.mesh.frustumCulled).toBe(false)
    layer.setFraction(0.5)
    expect(layer.mesh.geometry.instanceCount).toBe(100)
    layer.setViewport(400, 300)
    layer.setTime(12)
    layer.dispose()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/glow.test.ts`
Expected: FAIL (cannot resolve `../src/galaxy/glow`).

- [ ] **Step 3: Write glow.ts**

Create `src/galaxy/glow.ts`:

```ts
import { AdditiveBlending, InstancedBufferGeometry, Mesh, ShaderMaterial } from 'three'
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
import { RENDER_ORDER } from './order'

// Unresolved light: a few thousand large, dim, soft sprites following the
// arm density, plus a warm bulge. This is what turns dots into arms; the
// resolved stars are the sparkle on top.

export interface GlowParams {
  count: number
  radius: number
  thickness: number
  bulgeRadius: number
  bulgeFraction: number
  sizeMin: number
  sizeMax: number
  alpha: number
  palette: Palette
}

export const GLOW_DEFAULTS: GlowParams = {
  count: 3000,
  radius: 4.5,
  thickness: 0.35,
  bulgeRadius: 0.55,
  bulgeFraction: 0.25,
  sizeMin: 0.3,
  sizeMax: 1.0,
  alpha: 0.05,
  palette: PALETTE,
}

export const GLOW_INTENSITY = 1.0

export function generateGlow(
  p: GlowParams,
  model: ArmModel,
  rand: () => number = Math.random,
): BillboardBuffers {
  const b = allocBillboards(p.count)
  const gauss = makeGauss(rand)
  const arms = model.params.arms

  for (let i = 0; i < p.count; i++) {
    const inBulge = rand() < p.bulgeFraction
    let r: number
    let a: number
    let yy: number
    let color: [number, number, number]
    if (inBulge) {
      const gx = gauss() * 2 * p.bulgeRadius * 1.3
      const gz = gauss() * 2 * p.bulgeRadius * 1.3
      r = Math.hypot(gx, gz)
      a = Math.atan2(gz, gx)
      yy = gauss() * 2 * p.bulgeRadius * 0.6
      color = p.palette[0]
    } else {
      r = (0.12 + 0.88 * Math.pow(rand(), 1.4)) * p.radius
      const t = r / p.radius
      a = model.sample(i % arms, r, t, rand, gauss)
      yy = gauss() * p.thickness * (1.0 - 0.6 * t)
      color = paletteAt(p.palette, t)
    }
    r = Math.min(1.2 * p.radius, r)
    b.radius[i] = r
    b.angle[i] = a
    b.y[i] = yy
    b.size[i] = lerp(p.sizeMin, p.sizeMax, rand()) * (inBulge ? 1.5 : 1.0)
    b.rotation[i] = rand() * Math.PI * 2
    b.shape[i] = 0
    b.color[i * 3] = color[0]
    b.color[i * 3 + 1] = color[1]
    b.color[i * 3 + 2] = color[2]
    b.alpha[i] = p.alpha * (0.7 + 0.6 * rand())
  }
  return b
}

const glowFragment = /* glsl */ `
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r2 = dot(d, d);
  float a = exp(-r2 * 3.0) * (1.0 - smoothstep(0.6, 1.0, r2));
  gl_FragColor = vec4(vColor * uIntensity, a * vAlpha);
}
`

export interface GlowLayer {
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  setTime(t: number): void
  /** Drawing-buffer pixels. */
  setViewport(width: number, height: number): void
  setFraction(fraction: number): void
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
  const uniforms = { ...billboardUniforms(width, height), uIntensity: { value: GLOW_INTENSITY } }
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
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/glow.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire into scene.ts**

In `src/scene.ts`, add the import `import { createGlow } from './galaxy/glow'`. After `scene.add(galaxy.group)`, add:

```ts
  const pr = renderer.getPixelRatio()
  const glow = createGlow(model, innerWidth * pr, innerHeight * pr)
  scene.add(glow.mesh)
```

In the resize handler, after `post.setSize(...)`, add:

```ts
    glow.setViewport(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio())
```

In `tick()`, next to `galaxy.setTime(elapsed)` inside the reduced-motion guard, add `glow.setTime(elapsed)`. Also call `glow.setTime(elapsed)` once at init next to the initial `galaxy.setTime(elapsed)`.

- [ ] **Step 6: Run tests, build, look**

Run: `npm test && npm run build && npm run dev`
Expected: green; the arms become continuous haze with the stars on top, the bulge a soft gold. If the disc is foggy, lower `GLOW_DEFAULTS.alpha`; if the arms are still dotty, raise `count` or `alpha`. Record the value you settle on in Task 10's table.

- [ ] **Step 7: Commit**

```bash
git add src/galaxy/glow.ts src/scene.ts tests/glow.test.ts
git commit -m "feat: glow layer for unresolved light and the bulge"
```

---

### Task 7: Dust layer (procedural atlas, lanes, multiply blend)

**Files:**
- Create: `src/galaxy/noise.ts`
- Create: `src/galaxy/dust.ts`
- Modify: `src/scene.ts` (add the layer)
- Test: `tests/noise.test.ts`
- Test: `tests/dust.test.ts`

**Interfaces:**
- Consumes: billboard API from Task 5, `ArmModel.laneAngle`, `RENDER_ORDER.dust`.
- Produces: `hash2(x, y, seed)`, `valueNoise(x, y, seed)`, `fbm(x, y, seed, octaves?)`, `renderCloudCell(size, seed): Float32Array` in noise.ts; `DustParams`, `DUST_DEFAULTS`, `generateDust(p, model, rand?)`, `buildDustAtlas(cellSize?, seed?): CanvasTexture | null`, `DustLayer { mesh, setTime, setViewport, setFraction, dispose }`, `createDust(model, width, height, overrides?, rand?)` in dust.ts.

- [ ] **Step 1: Write the failing noise test**

Create `tests/noise.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fbm, hash2, renderCloudCell, valueNoise } from '../src/galaxy/noise'

describe('noise', () => {
  it('hash is deterministic and in [0, 1)', () => {
    expect(hash2(3, 4, 1)).toBe(hash2(3, 4, 1))
    expect(hash2(3, 4, 1)).not.toBe(hash2(3, 4, 2))
    for (let i = 0; i < 100; i++) {
      const h = hash2(i, i * 7, 5)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
    }
  })

  it('value noise interpolates the lattice and stays in [0, 1]', () => {
    expect(valueNoise(2, 5, 1)).toBeCloseTo(hash2(2, 5, 1), 6)
    for (let i = 0; i < 200; i++) {
      const n = valueNoise(i * 0.37, i * 0.11, 1)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1)
    }
  })

  it('fbm stays in [0, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const n = fbm(i * 0.21, i * 0.13, 2)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1)
    }
  })

  it('cloud cell is soft-edged with structure inside', () => {
    const size = 32
    const cell = renderCloudCell(size, 3)
    expect(cell).toHaveLength(size * size)
    // corners fall outside the radial falloff
    expect(cell[0]).toBe(0)
    expect(cell[size - 1]).toBe(0)
    expect(cell[size * size - 1]).toBe(0)
    let max = 0
    let min = 1
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        const v = cell[y * size + x]
        max = Math.max(max, v)
        min = Math.min(min, v)
      }
    }
    expect(max).toBeGreaterThan(0.5)
    expect(min).toBeLessThan(0.5)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/noise.test.ts`
Expected: FAIL (cannot resolve `../src/galaxy/noise`).

- [ ] **Step 3: Write noise.ts**

Create `src/galaxy/noise.ts`:

```ts
// Deterministic value noise for the procedural dust atlas. Pure functions,
// no DOM, so the cell renderer is unit-testable; dust.ts paints cells into
// a canvas texture.

export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const a = hash2(x0, y0, seed)
  const b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed)
  const d = hash2(x0 + 1, y0 + 1, seed)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return top + (bottom - top) * fy
}

export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let freq = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 101)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/** One atlas cell: a filamentary cloud mask in [0, 1] with a soft radial edge. */
export function renderCloudCell(size: number, seed: number): Float32Array {
  const out = new Float32Array(size * size)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size * 2 - 1
      const v = (py + 0.5) / size * 2 - 1
      const rad = Math.hypot(u, v)
      const edge = 1 - smoothClamp(rad, 0.55, 1.0)
      const n = fbm(u * 2.5 + seed * 7, v * 2.5 + seed * 3, seed)
      const filaments = smoothClamp(n, 0.38, 0.72)
      out[py * size + px] = filaments * edge
    }
  }
  return out
}

function smoothClamp(v: number, lo: number, hi: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return smooth(t)
}
```

- [ ] **Step 4: Run the noise test**

Run: `npx vitest run tests/noise.test.ts`
Expected: PASS, 4 tests. If the "structure inside" assertion fails, widen the fbm frequency (`2.5`) or the filament thresholds until both a value above 0.5 and one below appear in the center block; the test pins that the mask is not flat.

- [ ] **Step 5: Write the failing dust test**

Create `tests/dust.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARM_DEFAULTS, createArmModel } from '../src/galaxy/arms'
import { buildDustAtlas, createDust, DUST_DEFAULTS, generateDust } from '../src/galaxy/dust'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateDust', () => {
  const model = createArmModel(ARM_DEFAULTS, mulberry(1))
  const d = generateDust({ ...DUST_DEFAULTS, count: 2000 }, model, mulberry(11))

  it('keeps the bulge dust-free and stays inside the disc', () => {
    for (const r of d.radius) {
      expect(r).toBeGreaterThanOrEqual(DUST_DEFAULTS.bulgeRadius * 1.5)
      expect(r).toBeLessThanOrEqual(DUST_DEFAULTS.radius * 1.05)
    }
  })

  it('uses the four atlas cells', () => {
    const seen = new Set<number>()
    for (const s of d.shape) {
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(4)
      seen.add(s)
    }
    expect(seen.size).toBe(4)
  })

  it('puts most instances on the arm lanes', () => {
    let onLane = 0
    for (let i = 0; i < d.radius.length; i++) {
      const r = d.radius[i]
      let best = Infinity
      for (let arm = 0; arm < ARM_DEFAULTS.arms; arm++) {
        const lane = model.laneAngle(arm, r, DUST_DEFAULTS.laneOffset)
        const delta = Math.atan2(Math.sin(d.angle[i] - lane), Math.cos(d.angle[i] - lane))
        best = Math.min(best, Math.abs(delta))
      }
      if (best < 0.25) onLane++
    }
    expect(onLane / d.radius.length).toBeGreaterThan(DUST_DEFAULTS.laneFraction * 0.8)
  })

  it('is thin in y', () => {
    for (const y of d.y) expect(Math.abs(y)).toBeLessThan(DUST_DEFAULTS.thickness * 1.5)
  })
})

describe('createDust', () => {
  it('builds a mesh in the dust render slot; atlas is null without a document', () => {
    expect(buildDustAtlas()).toBeNull()
    const model = createArmModel(ARM_DEFAULTS, mulberry(1))
    const layer = createDust(model, 800, 600, { count: 100 }, mulberry(2))
    expect(layer.mesh.renderOrder).toBe(RENDER_ORDER.dust)
    layer.setFraction(0.25)
    expect(layer.mesh.geometry.instanceCount).toBe(25)
    layer.dispose()
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/dust.test.ts`
Expected: FAIL (cannot resolve `../src/galaxy/dust`).

- [ ] **Step 7: Write dust.ts**

Create `src/galaxy/dust.ts`:

```ts
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
import { lerp, makeGauss } from './math'
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
export const DUST_ABSORB = 0.85
/** Per-channel absorption: red passes most, blue least, so lanes read brown. */
export const DUST_TINT: [number, number, number] = [0.55, 0.78, 1.0]

const ATLAS_CELLS = 4

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
varying vec2 vUv;
varying float vAlpha;
varying float vShape;

void main() {
  vec2 cell = vec2(mod(vShape, 2.0), floor(vShape / 2.0));
  float mask = texture2D(uAtlas, (vUv + cell) * 0.5).r;
  float a = mask * vAlpha * uAbsorb;
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
    dispose() {
      geometry.dispose()
      material.dispose()
      atlas?.dispose()
    },
  }
}
```

- [ ] **Step 8: Run the dust tests**

Run: `npx vitest run tests/dust.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Wire into scene.ts**

In `src/scene.ts`, add `import { createDust } from './galaxy/dust'`. After the glow lines, add:

```ts
  const dust = createDust(model, innerWidth * pr, innerHeight * pr)
  scene.add(dust.mesh)
```

Add `dust.setViewport(...)` next to `glow.setViewport(...)` in the resize handler, and `dust.setTime(elapsed)` next to each `glow.setTime(elapsed)`.

- [ ] **Step 10: Run tests, build, look**

Run: `npm test && npm run build && npm run dev`
Expected: green; brown filamentary lanes trace the inner edge of each arm, strongest against the glow; stars on the camera side stay bright over them; orbiting below the plane flips the effect correctly. Zoom all the way in: no sprite fills the screen (the size cap and near fade). If the lanes are on the convex side of the arms, flip the sign of `DUST_DEFAULTS.laneOffset`. If lanes are grey rather than brown, raise the spread between `DUST_TINT` channels. Record final values in Task 10.

- [ ] **Step 11: Commit**

```bash
git add src/galaxy/noise.ts src/galaxy/dust.ts src/scene.ts tests/noise.test.ts tests/dust.test.ts
git commit -m "feat: dust lanes with procedural cloud atlas and multiply blend"
```

---

### Task 8: Background starfield v2 and deep field

**Files:**
- Modify: `src/galaxy/starfield.ts` (full rewrite)
- Create: `src/galaxy/deepfield.ts`
- Modify: `src/scene.ts` (replace `scene.add(createStarfield())`)
- Test: `tests/starfield.test.ts`
- Test: `tests/deepfield.test.ts`

**Interfaces:**
- Consumes: `starProfileChunk`, billboard API, `RENDER_ORDER.background`.
- Produces: `generateStarfield(count, brightCount, rand?)`, `Starfield { points, setPixelRatio(pr), dispose() }`, `createStarfield(pixelRatio?, count?, brightCount?, rand?)`; `generateDeepField(count, rand?)`, `DeepField { mesh, setViewport(w, h), dispose() }`, `createDeepField(width, height, count?, rand?)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/starfield.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createStarfield, generateStarfield } from '../src/galaxy/starfield'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateStarfield', () => {
  const s = generateStarfield(1000, 20, mulberry(4))

  it('places every star on the far shell', () => {
    for (let i = 0; i < 1000; i++) {
      const r = Math.hypot(s.position[i * 3], s.position[i * 3 + 1], s.position[i * 3 + 2])
      expect(r).toBeGreaterThanOrEqual(40)
      expect(r).toBeLessThanOrEqual(60)
    }
  })

  it('flags exactly brightCount spiked stars, larger than the rest', () => {
    let spiked = 0
    let minBright = Infinity
    let maxDim = 0
    for (let i = 0; i < 1000; i++) {
      if (s.spike[i] === 1) {
        spiked++
        minBright = Math.min(minBright, s.size[i])
      } else {
        maxDim = Math.max(maxDim, s.size[i])
      }
    }
    expect(spiked).toBe(20)
    expect(minBright).toBeGreaterThan(maxDim)
  })

  it('mixes temperatures: some orange, some blue-white, colors in range', () => {
    let orange = 0
    let blue = 0
    for (let i = 0; i < 1000; i++) {
      const [r, g, b] = [s.color[i * 3], s.color[i * 3 + 1], s.color[i * 3 + 2]]
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
      if (r > b + 0.2) orange++
      if (b > r + 0.1) blue++
    }
    expect(orange).toBeGreaterThan(50)
    expect(blue).toBeGreaterThan(100)
  })
})

describe('createStarfield', () => {
  it('builds background points and scales with pixel ratio', () => {
    const sf = createStarfield(2, 500, 10, mulberry(1))
    expect(sf.points.renderOrder).toBe(RENDER_ORDER.background)
    expect(sf.points.material.uniforms.uPixelRatio.value).toBe(2)
    sf.setPixelRatio(1.5)
    expect(sf.points.material.uniforms.uPixelRatio.value).toBe(1.5)
    sf.dispose()
  })
})
```

Create `tests/deepfield.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDeepField, generateDeepField } from '../src/galaxy/deepfield'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateDeepField', () => {
  const d = generateDeepField(40, mulberry(8))

  it('places smudges on the far shell, elongated, faint', () => {
    for (let i = 0; i < 40; i++) {
      const r = Math.hypot(d.radius[i], d.y[i])
      expect(r).toBeGreaterThanOrEqual(45)
      expect(r).toBeLessThanOrEqual(55)
      expect(d.shape[i]).toBeGreaterThanOrEqual(1.5)
      expect(d.shape[i]).toBeLessThanOrEqual(3.5)
      expect(d.alpha[i]).toBeLessThanOrEqual(0.35)
      expect(d.alpha[i]).toBeGreaterThan(0)
    }
  })
})

describe('createDeepField', () => {
  it('does not orbit and sits in the background slot', () => {
    const field = createDeepField(800, 600, 10, mulberry(2))
    expect(field.mesh.renderOrder).toBe(RENDER_ORDER.background)
    expect(field.mesh.material.uniforms.uOrbit.value).toBe(0)
    field.setViewport(400, 300)
    field.dispose()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/starfield.test.ts tests/deepfield.test.ts`
Expected: FAIL (no `generateStarfield` export; cannot resolve deepfield).

- [ ] **Step 3: Rewrite starfield.ts**

Replace the full contents of `src/galaxy/starfield.ts` with:

```ts
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
```

- [ ] **Step 4: Write deepfield.ts**

Create `src/galaxy/deepfield.ts`:

```ts
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
```

- [ ] **Step 5: Wire into scene.ts**

In `src/scene.ts`, change the starfield import to `import { createStarfield } from './galaxy/starfield'` (unchanged path) and add `import { createDeepField } from './galaxy/deepfield'`. Replace `scene.add(createStarfield())` with:

```ts
  const starfield = createStarfield(pr)
  scene.add(starfield.points)
  const deepField = createDeepField(innerWidth * pr, innerHeight * pr)
  scene.add(deepField.mesh)
```

(`pr` is declared before the glow lines in Task 6; move `const pr = renderer.getPixelRatio()` above this block if needed.) Add `deepField.setViewport(...)` next to the other `setViewport` calls in the resize handler.

- [ ] **Step 6: Run tests, build, look**

Run: `npm test && npm run build && npm run dev`
Expected: green; the background has a spread of star sizes and colors, two dozen bright spiked stars, and faint tilted smudges that never compete with the galaxy. If the smudges read as bright blobs, lower the deep field alpha range.

- [ ] **Step 7: Commit**

```bash
git add src/galaxy/starfield.ts src/galaxy/deepfield.ts src/scene.ts tests/starfield.test.ts tests/deepfield.test.ts
git commit -m "feat: temperature-colored starfield with spiked foreground stars, deep field smudges"
```

---

### Task 9: Quality ladder and level application

**Files:**
- Modify: `src/quality.ts` (full rewrite)
- Modify: `tests/quality.test.ts` (full rewrite)
- Modify: `src/scene.ts` (full rewrite, consolidating Tasks 3-8)
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `GlowLayer.setFraction`, `DustLayer.setFraction`, `PostChain.setBloom/setSize`, `Galaxy.rebuild/setPixelRatio`, `Starfield.setPixelRatio`, every layer's `setViewport`.
- Produces: `QualityLevel { stars, glow, dust, bloom, pixelRatioCap }`, `LADDER: readonly QualityLevel[]`, `pickInitialLevel(width, height, cores, coarsePointer): number`, `FpsGovernor(levelIndex).update(dt): number | null`; `createScene(container, level: QualityLevel)`, `GalaxyScene.applyLevel(level)`.

- [ ] **Step 1: Rewrite the quality tests**

Replace the full contents of `tests/quality.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { FpsGovernor, LADDER, pickInitialLevel } from '../src/quality'

describe('LADDER', () => {
  it('is ordered from most to least expensive, each step dropping something', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const hi = LADDER[i - 1]
      const lo = LADDER[i]
      expect(lo.stars).toBeLessThanOrEqual(hi.stars)
      expect(lo.glow).toBeLessThanOrEqual(hi.glow)
      expect(lo.dust).toBeLessThanOrEqual(hi.dust)
      expect(lo.pixelRatioCap).toBeLessThanOrEqual(hi.pixelRatioCap)
      expect(Number(lo.bloom)).toBeLessThanOrEqual(Number(hi.bloom))
      const changed =
        lo.stars < hi.stars ||
        lo.glow < hi.glow ||
        lo.dust < hi.dust ||
        lo.pixelRatioCap < hi.pixelRatioCap ||
        (hi.bloom && !lo.bloom)
      expect(changed).toBe(true)
    }
  })

  it('drops bloom before anything else', () => {
    expect(LADDER[0].bloom).toBe(true)
    expect(LADDER[1].bloom).toBe(false)
    expect(LADDER[1].stars).toBe(LADDER[0].stars)
    expect(LADDER[1].glow).toBe(LADDER[0].glow)
  })

  it('drops layer density before the star count falls below the second tier', () => {
    const firstStarDrop = LADDER.findIndex((l) => l.stars < LADDER[0].stars)
    expect(LADDER[firstStarDrop].glow).toBeLessThan(1)
  })
})

describe('pickInitialLevel', () => {
  it('gives big desktops the top level', () => {
    expect(pickInitialLevel(2560, 1440, 10, false)).toBe(0)
  })
  it('never starts a coarse-pointer device with bloom', () => {
    expect(LADDER[pickInitialLevel(2560, 1440, 10, true)].bloom).toBe(false)
    expect(LADDER[pickInitialLevel(390, 844, 6, true)].bloom).toBe(false)
  })
  it('gives phones a reduced level', () => {
    expect(LADDER[pickInitialLevel(390, 844, 6, true)].stars).toBeLessThanOrEqual(25_000)
  })
})

describe('FpsGovernor', () => {
  it('steps down one level after sustained low fps', () => {
    const gov = new FpsGovernor(0)
    let stepped: number | null = null
    for (let i = 0; i < 60; i++) {
      const next = gov.update(1 / 15)
      if (next !== null) stepped = next
    }
    expect(stepped).toBe(1)
  })

  it('does not step down on good fps', () => {
    const gov = new FpsGovernor(0)
    for (let i = 0; i < 600; i++) expect(gov.update(1 / 60)).toBeNull()
  })

  it('stops at the lowest level', () => {
    const gov = new FpsGovernor(LADDER.length - 1)
    for (let i = 0; i < 600; i++) expect(gov.update(1 / 10)).toBeNull()
  })

  it('walks the whole ladder under sustained low fps', () => {
    const gov = new FpsGovernor(0)
    const seen: number[] = []
    for (let i = 0; i < 60 * LADDER.length; i++) {
      const next = gov.update(1 / 15)
      if (next !== null) seen.push(next)
    }
    expect(seen).toEqual(LADDER.map((_, i) => i).slice(1))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/quality.test.ts`
Expected: FAIL (no `LADDER`, `pickInitialLevel`).

- [ ] **Step 3: Rewrite quality.ts**

Replace the full contents of `src/quality.ts` with:

```ts
// Quality ladder. Stepping down drops bloom first, then layer density
// (instance counts, no rebuild), then the resolved star count.

export interface QualityLevel {
  stars: number
  /** Fraction of glow instances drawn. */
  glow: number
  /** Fraction of dust instances drawn. */
  dust: number
  bloom: boolean
  pixelRatioCap: number
}

export const LADDER: readonly QualityLevel[] = [
  { stars: 60_000, glow: 1, dust: 1, bloom: true, pixelRatioCap: 2 },
  { stars: 60_000, glow: 1, dust: 1, bloom: false, pixelRatioCap: 2 },
  { stars: 40_000, glow: 0.75, dust: 0.75, bloom: false, pixelRatioCap: 2 },
  { stars: 25_000, glow: 0.5, dust: 0.5, bloom: false, pixelRatioCap: 1.5 },
  { stars: 15_000, glow: 0, dust: 0, bloom: false, pixelRatioCap: 1 },
]

const LOW_FPS = 28
const SUSTAIN_SECONDS = 3

/** Index into LADDER. Coarse pointers (phones, tablets) never start with bloom. */
export function pickInitialLevel(
  width: number,
  height: number,
  cores: number,
  coarsePointer: boolean,
): number {
  const pixels = width * height
  if (!coarsePointer && pixels >= 1_500_000 && cores >= 8) return 0
  if (pixels >= 700_000 && cores >= 4) return 2
  return 3
}

export class FpsGovernor {
  private belowFor = 0
  private level: number

  constructor(levelIndex: number) {
    this.level = levelIndex
  }

  /** Returns the next ladder index when a step down is due, else null. */
  update(dt: number): number | null {
    if (this.level >= LADDER.length - 1) return null
    const fps = 1 / Math.max(dt, 1e-6)
    this.belowFor = fps < LOW_FPS ? this.belowFor + dt : 0
    if (this.belowFor >= SUSTAIN_SECONDS) {
      this.belowFor = 0
      this.level += 1
      return this.level
    }
    return null
  }
}
```

- [ ] **Step 4: Run the quality tests**

Run: `npx vitest run tests/quality.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Rewrite scene.ts in full**

Replace the full contents of `src/scene.ts` with (this consolidates the incremental edits of Tasks 3-8):

```ts
import { Clock, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { createArmModel } from './galaxy/arms'
import { createDeepField } from './galaxy/deepfield'
import { createDust } from './galaxy/dust'
import { createGalaxy, type Galaxy } from './galaxy/galaxy'
import { createGlow } from './galaxy/glow'
import { createStarfield } from './galaxy/starfield'
import type { QualityLevel } from './quality'
import { createPost, type PostChain } from './render/post'

export interface GalaxyScene {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  galaxy: Galaxy
  post: PostChain
  /** Apply a quality level: star count, layer density, bloom, pixel ratio. */
  applyLevel(level: QualityLevel): void
  onFrame(cb: (dt: number, elapsed: number) => void): void
  start(): void
}

export function hasWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function createScene(container: HTMLElement, level: QualityLevel): GalaxyScene {
  const scene = new Scene()
  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200)
  camera.position.set(0, 3.2, 7.5)

  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  let pixelRatio = Math.min(devicePixelRatio, level.pixelRatioCap)
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(innerWidth, innerHeight)
  container.appendChild(renderer.domElement)
  // Telemetry reads info.render.calls once per frame; with a post chain each
  // pass would otherwise reset it, leaving only the last pass's count.
  renderer.info.autoReset = false

  // One arm model for every layer so stars, glow and dust share ridges and spurs.
  const model = createArmModel()
  const galaxy = createGalaxy(model, { count: level.stars }, pixelRatio)
  const glow = createGlow(model, innerWidth * pixelRatio, innerHeight * pixelRatio)
  const dust = createDust(model, innerWidth * pixelRatio, innerHeight * pixelRatio)
  const starfield = createStarfield(pixelRatio)
  const deepField = createDeepField(innerWidth * pixelRatio, innerHeight * pixelRatio)
  scene.add(starfield.points, deepField.mesh, glow.mesh, galaxy.group, dust.mesh)

  const post = createPost(renderer, scene, camera, innerWidth, innerHeight)
  window.__renderPath = post.path

  let currentStars = level.stars
  const layout = () => {
    const w = innerWidth * pixelRatio
    const h = innerHeight * pixelRatio
    post.setSize(innerWidth, innerHeight, pixelRatio)
    galaxy.setPixelRatio(pixelRatio)
    starfield.setPixelRatio(pixelRatio)
    glow.setViewport(w, h)
    dust.setViewport(w, h)
    deepField.setViewport(w, h)
  }
  const applyLevel = (next: QualityLevel) => {
    if (next.stars !== currentStars) {
      galaxy.rebuild(next.stars)
      currentStars = next.stars
    }
    glow.setFraction(next.glow)
    dust.setFraction(next.dust)
    post.setBloom(next.bloom)
    pixelRatio = Math.min(devicePixelRatio, next.pixelRatioCap)
    layout()
  }
  applyLevel(level)

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new Clock()
  const frameCbs: Array<(dt: number, elapsed: number) => void> = []
  // Start well into the swirl so differential rotation has already sheared
  // the arms out of their symmetric phases (scaled with orbitalSpeed).
  let elapsed = 160
  let running = true
  let contextLost = false
  const setTime = (t: number) => {
    galaxy.setTime(t)
    glow.setTime(t)
    dust.setTime(t)
  }
  setTime(elapsed)

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    contextLost = true
    running = false
    const note = document.createElement('div')
    note.className = 'hud-panel open context-lost'
    const msg = document.createElement('div')
    msg.className = 'hud-line'
    msg.textContent = 'RENDER LINK LOST'
    const btn = document.createElement('button')
    btn.className = 'hud-action'
    btn.textContent = 'Reload'
    btn.addEventListener('click', () => location.reload())
    note.append(msg, btn)
    document.getElementById('hud')!.append(note)
  })

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    layout()
  })

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden && !contextLost
    if (running) clock.getDelta() // swallow the hidden-time delta
  })

  function tick() {
    requestAnimationFrame(tick)
    if (!running) return
    const dt = Math.min(clock.getDelta(), 0.1)
    if (!reducedMotion) {
      elapsed += dt
      setTime(elapsed)
    }
    galaxy.setCameraSide(camera.position.y >= 0)
    for (const cb of frameCbs) cb(dt, elapsed)
    renderer.info.reset()
    post.render()
    window.__frameCount = (window.__frameCount ?? 0) + 1
  }

  return {
    scene,
    camera,
    renderer,
    galaxy,
    post,
    applyLevel,
    onFrame: (cb) => void frameCbs.push(cb),
    start: tick,
  }
}

declare global {
  interface Window {
    __frameCount?: number
    __renderPath?: 'hdr' | 'direct'
    __nodeScreen?: (id: string) => { x: number; y: number }
  }
}
```

- [ ] **Step 6: Update main.ts**

In `src/main.ts`:

Change the quality import to `import { FpsGovernor, LADDER, pickInitialLevel } from './quality'`.

Replace lines 18-20 (`const count = ...` through `const governor = ...`) with:

```ts
  const levelIndex = pickInitialLevel(
    innerWidth,
    innerHeight,
    navigator.hardwareConcurrency ?? 4,
    matchMedia('(pointer: coarse)').matches,
  )
  const sceneCtx = createScene(app, LADDER[levelIndex])
  const governor = new FpsGovernor(levelIndex)
```

Replace `telemetry.setParticles(count)` with `telemetry.setParticles(LADDER[levelIndex].stars)`.

Replace the governor block inside `sceneCtx.onFrame` with:

```ts
    const stepDown = governor.update(dt)
    if (stepDown !== null) {
      sceneCtx.applyLevel(LADDER[stepDown])
      telemetry.setParticles(LADDER[stepDown].stars)
    }
```

- [ ] **Step 7: Run everything**

Run: `npm test && npm run build && npm run e2e`
Expected: vitest green (all files); tsc clean; the full Playwright suite passes on every project (mobile projects included).

- [ ] **Step 8: Verify the ladder by hand**

Run: `npm run dev`. In the browser devtools console, throttle the CPU (Performance panel, 6x slowdown) and watch the telemetry: FPS falls, and within a few seconds the DRAW count drops (bloom off), then STARS drops. Restore the throttle. Also confirm the DRAW readout on the hdr path is in the twenties (composer passes) rather than 007.

- [ ] **Step 9: Commit**

```bash
git add src/quality.ts tests/quality.test.ts src/scene.ts src/main.ts
git commit -m "feat: quality ladder drops bloom, then layer density, then stars"
```

---

### Task 10: Tune by eye, beacons, social card, docs, ship

**Files:**
- Modify: tuning constants listed below
- Modify: `src/nodes/registry.ts` (positions only, if needed)
- Modify: `public/og.png` (recapture)
- Modify: `docs/superpowers/specs/2026-09-10-galaxy-fidelity-design.md` (deviations)
- Modify: `docs/superpowers/plans/2026-09-10-galaxy-fidelity.md` (this file: final values)
- Modify: `CLAUDE.md` (spec/plan pointers, architecture note)

- [ ] **Step 1: Review on desktop and phone**

Run: `npm run dev -- --host` and open the LAN URL on the phone as well. Bradley judges against the reference and the spec's success criteria: gold core without a hard white plateau, continuous arms, brown lanes on the concave edges, colored background stars, no sprite filling the screen when zoomed in, telemetry FPS at 60 (desktop) and 30+ (phone).

- [ ] **Step 2: Tune, recording every change here**

Adjust only these constants; write the final value into this table and into the matching code comment where one exists.

| Constant | File | Starting value | Final |
|---|---|---|---|
| `EXPOSURE` | src/render/post.ts | 1.0 | 0.85 |
| `BLOOM.strength / radius / threshold` | src/render/post.ts | 0.6 / 0.4 / 1.0 | 0.3 / 0.3 / 1.0 |
| `VIGNETTE` | src/render/post.ts | 0.35 | unchanged |
| `STAR_INTENSITY` | src/galaxy/galaxy.ts | 0.75 | 0.36 |
| `BASE_POINT_SIZE` | src/galaxy/galaxy.ts | 22 | unchanged |
| `ARM_DEFAULTS.spin / spread / spreadGrowth / spurSlope` | src/galaxy/arms.ts | 0.95 / 0.14 / 0.45 / 0.9 | unchanged |
| `GALAXY_DEFAULTS.bulgeRadius / bulgeFraction` | src/galaxy/generate.ts | 0.55 / 0.18 | 0.55 (unchanged) / 0.09 |
| `PALETTE` | src/galaxy/generate.ts | see file | gold [0.85, 0.68, 0.42], inner disc [0.88, 0.78, 0.62]; blue-white and blue edge unchanged |
| `GLOW_DEFAULTS.count / alpha / sizeMin / sizeMax` | src/galaxy/glow.ts | 3000 / 0.05 / 0.3 / 1.0 | 5000 / 0.048 / 0.12 / 0.36 |
| `GLOW_DEFAULTS.bulgeAlphaScale` (added in round one) | src/galaxy/glow.ts | n/a (bulge shared `alpha`) | 0.2 |
| `GLOW_INTENSITY` | src/galaxy/glow.ts | 1.0 | 0.8 |
| `DUST_DEFAULTS.count / laneOffset / laneFraction / sizeMin / sizeMax` | src/galaxy/dust.ts | 2500 / 0.18 / 0.7 / 0.2 / 0.6 | unchanged |
| `DUST_ABSORB`, `DUST_TINT` | src/galaxy/dust.ts | 0.85, [0.55, 0.78, 1.0] | 0.65, tint unchanged |
| `FADE_START` (added in Task 10d) | src/galaxy/dust.ts | none | 0.04 |
| `FADE_FULL` (added in Task 10d) | src/galaxy/dust.ts | none | 0.18 |
| `BRIGHT_GIANT_CUTOFF` (round-one lever) | src/galaxy/generate.ts | 0.8 | 0.995 |
| `ARM_FLOOR` / `ARM_EXPONENT` (round-two levers, inline literals until round two named them) | src/galaxy/generate.ts | 0.12 / 1.7 | 0.12 (unchanged) / 0.9 |
| `GLOW_FLOOR` / `GLOW_EXPONENT` (round-two levers, inline literals until round two named them) | src/galaxy/glow.ts | 0.12 / 1.4 | 0.12 (unchanged) / 0.9 |
| `uNearFade` | src/galaxy/billboard.ts | 1.5 | unchanged |
| `STARFIELD_INTENSITY` | src/galaxy/starfield.ts | 0.6 | unchanged |
| deep field alpha range | src/galaxy/deepfield.ts | 0.15 to 0.35 | unchanged |

Round one also fixed two things outside the table: `haloTexture()` in
`src/nodes/beacons.ts` now tags its CanvasTexture `SRGBColorSpace` and uses a
steeper gradient (the halos were rendering as flat pale discs), and
`parseLevelParam` in `src/quality.ts` plus the `src/main.ts` wiring add
`?level=N`, which pins a quality level and skips the governor so a capture
shows the level it asks for.

Round two changed only the two radial exponents. Both radial laws used an
exponent above 1, which piles instances just outside the floor: 26% of the disc
stars sat between r = 0.54 and r = 0.94, about 24 times the surface density of
the rim, and additive accumulation there ran far past AgX's shoulder. That
pile-up was the clipped cream oval, and its tangent points were the two bright
vertical bands inside it. Exponents below 1 taper the density into the bulge
instead and hand the difference to the outer arms, which removes both without
touching brightness: the widest run of pixels over luminance 150 across the
core falls from 175px to 31px at 1600x900, while the whole-frame mean
luminance moves 15.76 to 15.67. The exponents are the only levers round two
moved; exposure, intensities, palette, bloom and the bulge parameters stayed at
their round-one values, which Bradley approved on real hardware.

One unit bound moved with them: `tests/generate.test.ts` "populates a bulge at
the center" counted stars inside `bulgeRadius` and wanted over 5%. That bound
was only reachable because the old law's pile-up sat just outside the floor and
the radial jitter pushed part of it inside 0.55. With the flatter law the share
is 3.5%, still 2.3 times what a disc of uniform surface density would put
there, so the bound is now 3%.

Glow instance count is the expensive dimension on a software rasterizer: on
headless Chromium each extra glow instance costs roughly 14 microseconds a
frame, so 11000 instances halved the headless frame rate and the hint e2e
test (which needs 2s of clamped frame dt inside a 5s timeout) went red. Haze
density is therefore bought with smaller sprites at a similar count, not with
more instances.

- [ ] **Step 3: Beacon placement**

With the two-arm structure settled, check each beacon at load: if one sits inside a dust lane or between arms where it reads as detached, move its `position` in `src/nodes/registry.ts` to the nearest arm at a similar radius (keep radii between 2.5 and 3.5 so the chevron flights and focus zone behave as today). Run `npm test && npm run e2e` after any move (beacon tests pin orbit math, not positions, so they should stay green).

- [ ] **Step 4: Winding check**

Leave the page open ten minutes (SIM-T reaches roughly +0760s). If the arms have smeared into rings and the layered look makes that read badly, do not fix it here: note it in the deviations section and raise the priority of the density-wave triage issue.

- [ ] **Step 5: Recapture the social card**

```bash
npm run build && (npm run preview -- --port 4173 --strictPort &) && sleep 2 && node scripts/capture-og.mjs
```

Then stop the preview server. Inspect `public/og.png` (1200x630) by eye.

- [ ] **Step 6: Record deviations**

Append to the spec's "Deviations accepted during the build" section, one bullet each: the starfield/deep field module split (no Group), the CustomBlending choice over MultiplyBlending, any tuned constant that left its spec range, the winding check outcome, and anything else that diverged.

Update `CLAUDE.md` Bindings: add the spec and plan lines for this round beneath the existing ones, and add one Architecture note: "Layers share `src/galaxy/arms.ts` and the `orbitChunk`; render order lives in `src/galaxy/order.ts`; the post chain in `src/render/post.ts` falls back to direct rendering without float targets."

- [ ] **Step 7: Full verification**

Run: `npm test && npm run build && npm run e2e`
Expected: all green. Read the output; do not claim green without it.

- [ ] **Step 8: Commit and ship**

```bash
git add -A
git commit -m "feat: galaxy fidelity tuning, beacon placement, social card, docs"
git push origin main
gh run watch --repo bshandley/handleyio
```

Expected: the Deploy workflow (test, build, e2e, deploy-pages) succeeds. Spot-check https://handley.io on desktop and phone.

---

## Self-review against the spec

- Success criteria: gold core (Tasks 2, 4, 6), continuous arms (6), dust lanes (7), colored background (8), fps and governor (9), no interaction changes (nothing touches camera/, hud/, interaction/, nodes/ code; registry positions are data), direct-path fallback (4).
- Architecture render order: order.ts (3), split (2, 3), dust between (7), beacons after (3), glow before dust (6). Post chain passes (4).
- Modules: arms (1), billboard (5), glow (6), dust (7), deepfield (8), post (4); changed generate (2), shaders (3), galaxy (3), starfield (8), scene (3-9), quality (9), main (3, 9), registry (10).
- Performance: size cap and near fade (5), info reset (4, 9), pixel ratio cap (9), HDR probe (4), reduced motion untouched (9 keeps the guard).
- Testing section: every listed vitest and Playwright test has a task; the by-eye checks are Task 10.
- Ship: og.png recapture and push (10).
- Type consistency: `createGalaxy(model, overrides, pixelRatio, rand)` used in Tasks 3 and 9; `setFraction`, `setViewport`, `setTime` names match across glow, dust, deepfield, scene; `PostChain.setSize(w, h, pixelRatio)` in Tasks 4 and 9; `pickInitialLevel(width, height, cores, coarsePointer)` in Tasks 9 tests and main.
