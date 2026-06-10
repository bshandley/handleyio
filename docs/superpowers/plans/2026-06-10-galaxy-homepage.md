# Galaxy Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the handley.io landing page: a swirling 3D WebGL particle galaxy with beacon-star link nodes (GitHub, email, LinkedIn) that open frosted-glass HUD panels, live GitHub commit data, and a no-WebGL fallback, deployed to GitHub Pages.

**Architecture:** Vite + vanilla TypeScript + Three.js. One Points draw call for the galaxy (differential rotation in the vertex shader), one for background stars. HUD is plain DOM positioned by projecting node coordinates to screen space. A node registry and a data-source interface are the extensibility seams. Static fallback links live in index.html and are hidden only after WebGL init succeeds.

**Tech Stack:** three ^0.184, vite ^8, typescript ^6, vitest ^4 (unit), @playwright/test ^1.60 (smoke, Chromium + Firefox), GitHub Pages via Actions.

**Spec:** `docs/superpowers/specs/2026-06-10-galaxy-homepage-design.md`

**Conventions for all tasks:** run commands from repo root. Commit messages use conventional prefixes. Never use em dashes in any text or code. If `npm install` reports a peer-dependency conflict between vite 8 and vitest, downgrade to `vite@^7` (everything in this plan works on both).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `public/CNAME`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "handleyio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "three": "^0.184.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.60.0",
    "@types/three": "^0.184.0",
    "typescript": "^6.0.0",
    "vite": "^8.0.0",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Write vite.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: { target: 'es2022' },
  test: { passWithNoTests: true },
})
```

- [ ] **Step 4: Write index.html**

The fallback section is visible by default and hidden by JS only after WebGL init succeeds. Links must work with JS disabled.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>handley.io</title>
    <meta name="description" content="Bradley Handley. GitHub, email, LinkedIn." />
    <meta property="og:title" content="handley.io" />
    <meta property="og:description" content="Bradley Handley. A small galaxy of links." />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <div id="hud" aria-live="polite"></div>
    <svg id="leader" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0" /></svg>
    <nav id="node-tabs" aria-label="Links"></nav>
    <section id="fallback">
      <h1>handley.io</h1>
      <ul>
        <li><a class="glass-card" href="https://github.com/bshandley">GitHub</a></li>
        <li><a class="glass-card" href="mailto:hello@handley.io">hello@handley.io</a></li>
        <li><a class="glass-card" href="https://www.linkedin.com/in/bshandley/">LinkedIn</a></li>
      </ul>
    </section>
    <div id="wordmark">handley.io</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write src/styles.css (base layer only; HUD panel styles arrive in Task 9)**

```css
:root {
  --hud-fg: #cde2ff;
  --hud-accent: #8cc0ff;
  --hud-dim: #8aa3c0;
  --mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body { height: 100%; }

body {
  background: #04060f;
  color: var(--hud-fg);
  font-family: var(--mono);
  overflow: hidden;
}

#app, #app canvas { position: fixed; inset: 0; }

#hud { position: fixed; inset: 0; pointer-events: none; z-index: 3; }

#leader { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; }
#leader line { stroke: rgba(140, 192, 255, 0.6); stroke-width: 1; visibility: hidden; }

#wordmark {
  position: fixed; left: 16px; bottom: 14px; z-index: 4;
  font-size: 13px; letter-spacing: 2px; color: var(--hud-dim);
  user-select: none;
}

/* Visually hidden but focusable keyboard targets */
#node-tabs button {
  position: fixed; width: 1px; height: 1px; overflow: hidden;
  clip-path: inset(50%); border: 0; padding: 0;
}
#node-tabs button:focus-visible {
  clip-path: none;
  width: auto; height: auto;
  overflow: visible;
  outline: 2px solid var(--hud-accent);
}

/* Fallback: CSS starfield plus glass link cards. Hidden by JS on WebGL success. */
#fallback {
  position: fixed; inset: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
  background:
    radial-gradient(1px 1px at 12% 20%, #fff, transparent),
    radial-gradient(1px 1px at 78% 16%, #cdf, transparent),
    radial-gradient(1.5px 1.5px at 32% 74%, #ffe, transparent),
    radial-gradient(1px 1px at 64% 86%, #fff, transparent),
    radial-gradient(1px 1px at 88% 56%, #fec, transparent),
    radial-gradient(ellipse 60% 40% at 50% 50%, rgba(80, 100, 200, 0.18), transparent 70%),
    #04060f;
}
#fallback.hidden { display: none; }
#fallback h1 { font-size: 18px; letter-spacing: 4px; font-weight: 400; }
#fallback ul { list-style: none; display: flex; flex-direction: column; gap: 14px; }

.glass-card {
  display: block; min-width: 240px; padding: 14px 20px; text-align: center;
  color: #fff; text-decoration: none; font-size: 14px;
  background: linear-gradient(160deg, rgba(40, 70, 120, 0.35), rgba(10, 20, 45, 0.55));
  border: 1px solid rgba(140, 190, 255, 0.35); border-radius: 8px;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 24px rgba(50, 120, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.glass-card:hover { border-color: rgba(140, 190, 255, 0.7); }
.glass-card:focus-visible { outline: 2px solid var(--hud-accent); outline-offset: 2px; }
```

- [ ] **Step 6: Write src/main.ts stub**

```ts
console.log('galaxy pending')
```

- [ ] **Step 7: Write public/CNAME**

```
handley.io
```

- [ ] **Step 8: Install and verify**

Run: `npm install`
Expected: completes without errors (see peer-dep note in Conventions).
Run: `npm run build`
Expected: tsc passes, vite build emits `dist/`.
Run: `npm run dev` then open the printed URL.
Expected: starfield background, three glass link cards, wordmark bottom-left.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold vite + ts project with static fallback page"
```

---

### Task 2: Node registry

**Files:**
- Create: `src/nodes/registry.ts`
- Test: `tests/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { NODES, nodeById } from '../src/nodes/registry'

describe('node registry', () => {
  it('contains github, email, linkedin', () => {
    expect(NODES.map((n) => n.id).sort()).toEqual(['email', 'github', 'linkedin'])
  })

  it('every node has a primary action and a 3d position', () => {
    for (const n of NODES) {
      expect(n.actions.length).toBeGreaterThan(0)
      expect(n.position).toHaveLength(3)
      expect(n.label.length).toBeGreaterThan(0)
      expect(n.designation).toMatch(/NODE \d\d/)
    }
  })

  it('nodeById returns the node or throws', () => {
    expect(nodeById('github').dataSourceId).toBe('github')
    expect(() => nodeById('nope')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry.test.ts`
Expected: FAIL, cannot resolve `../src/nodes/registry`.

- [ ] **Step 3: Write src/nodes/registry.ts**

```ts
export type NodeAction =
  | { label: string; kind: 'open'; href: string }
  | { label: string; kind: 'copy'; text: string }

export interface GalaxyNode {
  id: string
  label: string
  designation: string
  position: [number, number, number]
  lines: string[]
  actions: NodeAction[]
  dataSourceId?: string
}

export const NODES: GalaxyNode[] = [
  {
    id: 'github',
    label: 'GITHUB',
    designation: 'NODE 01 · GH-SECTOR',
    position: [2.8, 0.25, 0.6],
    lines: ['github.com/bshandley'],
    actions: [{ label: 'Open ↗', kind: 'open', href: 'https://github.com/bshandley' }],
    dataSourceId: 'github',
  },
  {
    id: 'email',
    label: 'EMAIL',
    designation: 'NODE 02 · COMMS-RELAY',
    position: [-1.9, -0.15, 2.4],
    lines: ['hello@handley.io'],
    actions: [
      { label: 'Copy', kind: 'copy', text: 'hello@handley.io' },
      { label: 'Compose ↗', kind: 'open', href: 'mailto:hello@handley.io' },
    ],
  },
  {
    id: 'linkedin',
    label: 'LINKEDIN',
    designation: 'NODE 03 · LI-OUTPOST',
    position: [-0.8, 0.3, -3.0],
    lines: ['Bradley Handley'],
    actions: [
      { label: 'Open ↗', kind: 'open', href: 'https://www.linkedin.com/in/bshandley/' },
    ],
  },
]

export function nodeById(id: string): GalaxyNode {
  const node = NODES.find((n) => n.id === id)
  if (!node) throw new Error(`unknown node: ${id}`)
  return node
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/registry.ts tests/registry.test.ts
git commit -m "feat: node registry with github, email, linkedin nodes"
```

---

### Task 3: Data source interface and cache

**Files:**
- Create: `src/data/source.ts`
- Test: `tests/source.test.ts`

- [ ] **Step 1: Write the failing test**

The cache takes injectable storage and clock so tests need no browser.

```ts
import { describe, expect, it, vi } from 'vitest'
import { withCache, type DataSource, type NodeData } from '../src/data/source'

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

function source(fetchData: () => Promise<NodeData>): DataSource {
  return { id: 'github', ttlMs: 1000, fetchData }
}

describe('withCache', () => {
  it('fetches on miss and stores the result', async () => {
    const fetchData = vi.fn(async () => ({ lines: ['a'] }))
    const storage = fakeStorage()
    const cached = withCache(source(fetchData), storage, () => 0)
    expect(await cached.fetchData()).toEqual({ lines: ['a'] })
    expect(await cached.fetchData()).toEqual({ lines: ['a'] })
    expect(fetchData).toHaveBeenCalledTimes(1)
  })

  it('refetches after ttl expiry', async () => {
    const fetchData = vi.fn(async () => ({ lines: ['a'] }))
    const storage = fakeStorage()
    let now = 0
    const cached = withCache(source(fetchData), storage, () => now)
    await cached.fetchData()
    now = 1001
    await cached.fetchData()
    expect(fetchData).toHaveBeenCalledTimes(2)
  })

  it('ignores corrupt cache entries', async () => {
    const storage = fakeStorage()
    storage.setItem('nodedata:github', '{not json')
    const cached = withCache(source(async () => ({ lines: ['a'] })), storage, () => 0)
    expect(await cached.fetchData()).toEqual({ lines: ['a'] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/source.test.ts`
Expected: FAIL, cannot resolve `../src/data/source`.

- [ ] **Step 3: Write src/data/source.ts**

```ts
export interface NodeData {
  lines: string[]
}

export interface DataSource {
  id: string
  ttlMs: number
  fetchData(): Promise<NodeData>
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function withCache(
  source: DataSource,
  storage: StorageLike = localStorage,
  now: () => number = Date.now,
): DataSource {
  const key = `nodedata:${source.id}`
  return {
    ...source,
    async fetchData() {
      try {
        const raw = storage.getItem(key)
        if (raw) {
          const entry = JSON.parse(raw) as { t: number; v: NodeData }
          if (now() - entry.t < source.ttlMs) return entry.v
        }
      } catch {
        // corrupt entry: fall through to a fresh fetch
      }
      const v = await source.fetchData()
      storage.setItem(key, JSON.stringify({ t: now(), v }))
      return v
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/source.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/source.ts tests/source.test.ts
git commit -m "feat: data source interface with localStorage cache wrapper"
```

---

### Task 4: GitHub commits data source

**Files:**
- Create: `src/data/github.ts`
- Test: `tests/github.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { parseGithubEvents, timeAgo } from '../src/data/github'

const DAY = 86_400_000
const NOW = 1_750_000_000_000

function pushEvent(agoMs: number, commits: number) {
  return {
    type: 'PushEvent',
    created_at: new Date(NOW - agoMs).toISOString(),
    payload: { size: commits },
  }
}

describe('parseGithubEvents', () => {
  it('sums commits from PushEvents in the last 30 days', () => {
    const events = [
      pushEvent(1 * DAY, 3),
      pushEvent(10 * DAY, 2),
      pushEvent(40 * DAY, 99),
      { type: 'WatchEvent', created_at: new Date(NOW).toISOString(), payload: {} },
    ]
    const data = parseGithubEvents(events, NOW)
    expect(data.lines[0]).toContain('5 commits')
    expect(data.lines[0]).toContain('30d')
  })

  it('renders a 10-bucket sparkline, oldest first', () => {
    const events = [pushEvent(1 * DAY, 4)]
    const data = parseGithubEvents(events, NOW)
    const spark = data.lines[0].split(' ')[0]
    expect(spark).toHaveLength(10)
    expect(spark[9]).toBe('█')
    expect(spark[0]).toBe('▁')
  })

  it('reports last push time', () => {
    const data = parseGithubEvents([pushEvent(2 * 3_600_000, 1)], NOW)
    expect(data.lines[1]).toBe('last push: 2h ago')
  })

  it('handles zero events', () => {
    const data = parseGithubEvents([], NOW)
    expect(data.lines[0]).toContain('0 commits')
    expect(data.lines[1]).toBe('last push: n/a')
  })

  it('clamps future-dated events into the newest bucket', () => {
    const data = parseGithubEvents([pushEvent(-60_000, 2)], NOW)
    const spark = data.lines[0].split(' ')[0]
    expect(spark).toHaveLength(10)
    expect(spark[9]).toBe('█')
  })
})

describe('timeAgo', () => {
  it('formats minutes, hours, days', () => {
    expect(timeAgo(5 * 60_000)).toBe('5m ago')
    expect(timeAgo(3 * 3_600_000)).toBe('3h ago')
    expect(timeAgo(2 * DAY)).toBe('2d ago')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/github.test.ts`
Expected: FAIL, cannot resolve `../src/data/github`.

- [ ] **Step 3: Write src/data/github.ts**

```ts
import type { DataSource, NodeData } from './source'

const DAY = 86_400_000
const WINDOW_DAYS = 30
const BUCKETS = 10
const BLOCKS = '▁▂▃▄▅▆▇█'

interface GithubEvent {
  type: string
  created_at: string
  payload: { size?: number }
}

export function timeAgo(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / DAY)}d ago`
}

export function parseGithubEvents(events: unknown[], now: number): NodeData {
  const windowMs = WINDOW_DAYS * DAY
  const pushes = (events as GithubEvent[]).filter(
    (e) =>
      e?.type === 'PushEvent' &&
      typeof e.created_at === 'string' &&
      now - Date.parse(e.created_at) < windowMs,
  )

  const buckets = new Array<number>(BUCKETS).fill(0)
  let total = 0
  let newest = -Infinity
  for (const e of pushes) {
    const t = Date.parse(e.created_at)
    const commits = e.payload?.size ?? 0
    total += commits
    newest = Math.max(newest, t)
    const age = now - t
    const bucket =
      BUCKETS - 1 - Math.min(BUCKETS - 1, Math.max(0, Math.floor(age / (windowMs / BUCKETS))))
    buckets[bucket] += commits
  }

  const peak = Math.max(1, ...buckets)
  const spark = buckets
    .map((c) => BLOCKS[c === 0 ? 0 : Math.min(7, 1 + Math.floor((c / peak) * 6.999))])
    .join('')

  return {
    lines: [
      `${spark} ${total} commits · ${WINDOW_DAYS}d`,
      pushes.length ? `last push: ${timeAgo(now - newest)}` : 'last push: n/a',
    ],
  }
}

export const githubSource: DataSource = {
  id: 'github',
  ttlMs: 3_600_000,
  async fetchData() {
    const res = await fetch('https://api.github.com/users/bshandley/events/public?per_page=100', {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`github api ${res.status}`)
    return parseGithubEvents(await res.json(), Date.now())
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/github.test.ts`
Expected: PASS (5 tests). If the sparkline test fails on the max bucket character, check the bucket index math first, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/data/github.ts tests/github.test.ts
git commit -m "feat: github commit activity data source with sparkline"
```

---

### Task 5: Galaxy particle generation and shaders

**Files:**
- Create: `src/galaxy/generate.ts`, `src/galaxy/shaders.ts`, `src/galaxy/galaxy.ts`
- Test: `tests/generate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { generateGalaxy, GALAXY_DEFAULTS } from '../src/galaxy/generate'

describe('generateGalaxy', () => {
  const g = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, mulberry(42))

  it('produces buffers sized to count', () => {
    expect(g.radius).toHaveLength(5000)
    expect(g.angle).toHaveLength(5000)
    expect(g.y).toHaveLength(5000)
    expect(g.size).toHaveLength(5000)
    expect(g.color).toHaveLength(15000)
  })

  it('keeps radii within bounds', () => {
    for (const r of g.radius) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(GALAXY_DEFAULTS.radius)
    }
  })

  it('keeps colors in [0, 1]', () => {
    for (const c of g.color) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for a seeded rng', () => {
    const h = generateGalaxy({ ...GALAXY_DEFAULTS, count: 5000 }, mulberry(42))
    expect(h.radius[123]).toBe(g.radius[123])
  })
})

function mulberry(seed: number): () => number {
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/generate.test.ts`
Expected: FAIL, cannot resolve `../src/galaxy/generate`.

- [ ] **Step 3: Write src/galaxy/generate.ts**

```ts
export interface GalaxyParams {
  count: number
  arms: number
  radius: number
  spin: number
  thickness: number
  coreColor: [number, number, number]
  midColor: [number, number, number]
  edgeColor: [number, number, number]
}

export const GALAXY_DEFAULTS: GalaxyParams = {
  count: 60_000,
  arms: 4,
  radius: 4.5,
  spin: 1.1,
  thickness: 0.35,
  coreColor: [1.0, 0.85, 0.6],
  midColor: [0.85, 0.7, 0.95],
  edgeColor: [0.45, 0.55, 1.0],
}

export interface GalaxyBuffers {
  radius: Float32Array
  angle: Float32Array
  y: Float32Array
  color: Float32Array
  size: Float32Array
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function generateGalaxy(
  p: GalaxyParams,
  rand: () => number = Math.random,
): GalaxyBuffers {
  const radius = new Float32Array(p.count)
  const angle = new Float32Array(p.count)
  const y = new Float32Array(p.count)
  const color = new Float32Array(p.count * 3)
  const size = new Float32Array(p.count)

  for (let i = 0; i < p.count; i++) {
    const r = Math.pow(rand(), 2.0) * p.radius
    const t = r / p.radius
    const arm = i % p.arms
    const armAngle = (arm / p.arms) * Math.PI * 2
    const scatter = (rand() - 0.5) * (0.25 + t * 0.9)
    radius[i] = r
    angle[i] = armAngle + r * p.spin + scatter

    const gauss = rand() + rand() + rand() - 1.5
    y[i] = gauss * p.thickness * (1.0 - 0.75 * t)

    const [c0, c1] =
      t < 0.5 ? [p.coreColor, p.midColor] : [p.midColor, p.edgeColor]
    const tt = t < 0.5 ? t * 2 : (t - 0.5) * 2
    const jitter = 0.85 + rand() * 0.15
    const dust = rand() < 0.06 ? 0.35 : 1.0
    color[i * 3] = Math.min(1, Math.max(0, lerp(c0[0], c1[0], tt) * jitter * dust))
    color[i * 3 + 1] = Math.min(1, Math.max(0, lerp(c0[1], c1[1], tt) * jitter * dust))
    color[i * 3 + 2] = Math.min(1, Math.max(0, lerp(c0[2], c1[2], tt) * jitter * dust))

    size[i] = (0.6 + rand() * 1.4) * (t < 0.15 ? 1.5 : 1.0)
  }

  return { radius, angle, y, color, size }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/generate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write src/galaxy/shaders.ts**

Differential rotation: angular speed falls off with radius, computed entirely on the GPU. `uTime` frozen at 0 gives the reduced-motion static galaxy.

```ts
export const galaxyVertex = /* glsl */ `
uniform float uTime;
uniform float uSize;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;

void main() {
  float speed = 0.35 / (0.3 + aRadius);
  float angle = aAngle + uTime * speed;
  vec3 pos = vec3(cos(angle) * aRadius, aY, sin(angle) * aRadius);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * aSize / max(0.001, -mv.z);
  vColor = aColor;
}
`

export const galaxyFragment = /* glsl */ `
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.0, d);
  alpha *= alpha;
  gl_FragColor = vec4(vColor, alpha);
}
`
```

- [ ] **Step 6: Write src/galaxy/galaxy.ts**

```ts
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
```

- [ ] **Step 7: Run the full unit suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/galaxy tests/generate.test.ts
git commit -m "feat: galaxy particle generation and differential-rotation shaders"
```

---

### Task 6: Scene, render loop, starfield

**Files:**
- Create: `src/scene.ts`, `src/galaxy/starfield.ts`
- Modify: `src/main.ts` (replace stub entirely)

- [ ] **Step 1: Write src/galaxy/starfield.ts**

```ts
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
} from 'three'

export function createStarfield(count = 2500, rand: () => number = Math.random): Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // random point on a far sphere, radius 40-60
    const u = rand() * 2 - 1
    const phi = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 40 + rand() * 20
    positions[i * 3] = s * Math.cos(phi) * r
    positions[i * 3 + 1] = u * r
    positions[i * 3 + 2] = s * Math.sin(phi) * r
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const material = new PointsMaterial({
    size: 1.2,
    sizeAttenuation: false,
    color: 0xbfd0ee,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  return new Points(geometry, material)
}
```

- [ ] **Step 2: Write src/scene.ts**

Owns renderer, camera, loop, DPR cap, resize, tab-visibility pause, reduced motion, and a frame-count test hook.

```ts
import { Clock, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { createGalaxy, type Galaxy } from './galaxy/galaxy'
import { createStarfield } from './galaxy/starfield'

export interface GalaxyScene {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  galaxy: Galaxy
  onFrame(cb: (dt: number) => void): void
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

export function createScene(container: HTMLElement, particleCount: number): GalaxyScene {
  const scene = new Scene()
  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200)
  camera.position.set(0, 3.2, 7.5)

  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  container.appendChild(renderer.domElement)

  const galaxy = createGalaxy({ count: particleCount })
  scene.add(galaxy.points)
  scene.add(createStarfield())

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new Clock()
  const frameCbs: Array<(dt: number) => void> = []
  let elapsed = 0
  let running = true

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden
    if (running) clock.getDelta() // swallow the hidden-time delta
  })

  function tick() {
    requestAnimationFrame(tick)
    if (!running) return
    const dt = Math.min(clock.getDelta(), 0.1)
    if (!reducedMotion) {
      elapsed += dt
      galaxy.setTime(elapsed)
    }
    for (const cb of frameCbs) cb(dt)
    renderer.render(scene, camera)
    window.__frameCount = (window.__frameCount ?? 0) + 1
  }

  return {
    scene,
    camera,
    renderer,
    galaxy,
    onFrame: (cb) => void frameCbs.push(cb),
    start: tick,
  }
}

declare global {
  interface Window {
    __frameCount?: number
  }
}
```

- [ ] **Step 3: Replace src/main.ts**

```ts
import { createScene, hasWebgl } from './scene'

function init() {
  if (!hasWebgl()) return // fallback section stays visible

  const app = document.getElementById('app')!
  const sceneCtx = createScene(app, 60_000)
  sceneCtx.start()
  document.getElementById('fallback')!.classList.add('hidden')
}

try {
  init()
} catch (err) {
  console.error('galaxy init failed, fallback remains', err)
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev` and open in Chrome and Firefox.
Expected: a swirling 4-arm spiral galaxy, warm core, blue-violet tips, background stars, smooth motion. Fallback cards gone. Check the console for errors. Switch to another tab for 10 seconds, return: no time jump in the swirl.

- [ ] **Step 5: Typecheck, then commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/scene.ts src/galaxy/starfield.ts src/main.ts
git commit -m "feat: render swirling galaxy scene with starfield and visibility pause"
```

---

### Task 7: Orbit camera with momentum and idle drift

**Files:**
- Create: `src/camera/controls.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write src/camera/controls.ts**

```ts
import type { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const IDLE_RESUME_MS = 5000

export function createControls(
  camera: PerspectiveCamera,
  dom: HTMLElement,
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
): OrbitControls {
  const controls = new OrbitControls(camera, dom)
  controls.enableDamping = true
  controls.dampingFactor = 0.04
  controls.rotateSpeed = 0.6
  controls.enablePan = false
  controls.minDistance = 4
  controls.maxDistance = 18
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.25

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  controls.addEventListener('start', () => {
    controls.autoRotate = false
    clearTimeout(idleTimer)
  })
  controls.addEventListener('end', () => {
    if (reducedMotion) return
    idleTimer = setTimeout(() => {
      controls.autoRotate = true
    }, IDLE_RESUME_MS)
  })

  return controls
}
```

- [ ] **Step 2: Wire into src/main.ts**

Replace the body of `init()`:

```ts
import { createControls } from './camera/controls'
import { createScene, hasWebgl } from './scene'

function init() {
  if (!hasWebgl()) return

  const app = document.getElementById('app')!
  const sceneCtx = createScene(app, 60_000)
  const controls = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)
  sceneCtx.onFrame(() => controls.update())
  sceneCtx.start()
  document.getElementById('fallback')!.classList.add('hidden')
}
```

(keep the existing try/catch around `init()`)

- [ ] **Step 3: Verify manually**

Run: `npm run dev`
Expected: drag orbits around the core and glides to a stop on release (momentum, not jerky). Scroll/pinch zooms within limits. Leave it alone 5 seconds: slow auto-drift resumes. Pan is disabled.

- [ ] **Step 4: Typecheck, then commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/camera/controls.ts src/main.ts
git commit -m "feat: orbit camera with damping momentum and idle auto-drift"
```

---

### Task 8: Beacon stars and picking

**Files:**
- Create: `src/nodes/beacons.ts`
- Test: `tests/beacons.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write the failing test**

Three.js raycasting works headlessly in Node, so picking is unit-testable.

```ts
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Raycaster, Vector2 } from 'three'
import { createBeacons } from '../src/nodes/beacons'
import { NODES } from '../src/nodes/registry'

describe('beacons', () => {
  const beacons = createBeacons(NODES)

  it('creates one beacon per node', () => {
    expect(beacons.group.children.length).toBeGreaterThanOrEqual(NODES.length)
  })

  it('pick returns the node id under the pointer', () => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 200)
    // place camera looking straight at the github node
    const [x, y, z] = NODES[0].position
    camera.position.set(x, y, z + 3)
    camera.lookAt(x, y, z)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(0, 0), camera)
    expect(beacons.pick(ray)).toBe('github')
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/beacons.test.ts`
Expected: FAIL, cannot resolve `../src/nodes/beacons`.

- [ ] **Step 3: Write src/nodes/beacons.ts**

Visible part: an additive-blended sprite with a canvas radial-gradient halo, pulsing via scale. Pick part: invisible hit spheres, raycast targets only.

```ts
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import type { GalaxyNode } from './registry'

const HIT_RADIUS = 0.4

export interface Beacons {
  group: Group
  pick(ray: Raycaster): string | null
  pulse(elapsed: number): void
  worldPosition(id: string): Vector3
}

function haloTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(160,210,255,0.9)')
  grad.addColorStop(1, 'rgba(120,180,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

export function createBeacons(nodes: GalaxyNode[]): Beacons {
  const group = new Group()
  const hitMeshes: Mesh[] = []
  const sprites = new Map<string, Sprite>()
  const texture = haloTexture()

  for (const node of nodes) {
    const geometry = new SphereGeometry(HIT_RADIUS, 8, 8)
    geometry.computeBoundingSphere()
    const hit = new Mesh(
      geometry,
      new MeshBasicMaterial({ visible: false }),
    )
    hit.position.set(...node.position)
    hit.updateMatrixWorld(true)
    hit.userData.nodeId = node.id
    hitMeshes.push(hit)
    group.add(hit)

    if (texture) {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: texture,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      )
      sprite.position.set(...node.position)
      sprite.scale.setScalar(0.5)
      sprites.set(node.id, sprite)
      group.add(sprite)
    }
  }

  return {
    group,
    pick(ray) {
      const hits = ray.intersectObjects(hitMeshes, false)
      return hits.length ? (hits[0].object.userData.nodeId as string) : null
    },
    pulse(elapsed) {
      let i = 0
      for (const sprite of sprites.values()) {
        sprite.scale.setScalar(0.5 + 0.08 * Math.sin(elapsed * 2.2 + i++ * 1.7))
      }
    },
    worldPosition(id) {
      const mesh = hitMeshes.find((m) => m.userData.nodeId === id)
      if (!mesh) throw new Error(`unknown node: ${id}`)
      return mesh.position.clone()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/beacons.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add beacons to the scene in src/main.ts**

Inside `init()`, after `createScene(...)`:

```ts
import { createBeacons } from './nodes/beacons'
import { NODES } from './nodes/registry'

const beacons = createBeacons(NODES)
sceneCtx.scene.add(beacons.group)
let pulseT = 0
sceneCtx.onFrame((dt) => {
  pulseT += dt
  beacons.pulse(pulseT)
})
```

- [ ] **Step 6: Verify manually**

Run: `npm run dev`
Expected: three brighter pulsing beacon stars embedded in the galaxy at distinct positions.

- [ ] **Step 7: Commit**

```bash
git add src/nodes/beacons.ts tests/beacons.test.ts src/main.ts
git commit -m "feat: pulsing beacon stars with raycast picking"
```

---

### Task 9: HUD panels, projector, leader line

**Files:**
- Create: `src/hud/projector.ts`, `src/hud/panel.ts`
- Test: `tests/projector.test.ts`
- Modify: `src/styles.css` (append panel styles)

- [ ] **Step 1: Write the failing projector test**

```ts
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { toScreen } from '../src/hud/projector'

describe('toScreen', () => {
  const camera = new PerspectiveCamera(55, 2, 0.1, 200)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()

  it('projects the origin to screen center', () => {
    const s = toScreen(new Vector3(0, 0, 0), camera, 800, 400)
    expect(s.visible).toBe(true)
    expect(s.x).toBeCloseTo(400)
    expect(s.y).toBeCloseTo(200)
  })

  it('marks points behind the camera as not visible', () => {
    const s = toScreen(new Vector3(0, 0, 20), camera, 800, 400)
    expect(s.visible).toBe(false)
  })

  it('maps +x to the right half', () => {
    const s = toScreen(new Vector3(2, 0, 0), camera, 800, 400)
    expect(s.x).toBeGreaterThan(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/projector.test.ts`
Expected: FAIL, cannot resolve `../src/hud/projector`.

- [ ] **Step 3: Write src/hud/projector.ts**

```ts
import { Vector3, type Camera } from 'three'

const v = new Vector3()

export interface ScreenPos {
  x: number
  y: number
  visible: boolean
}

export function toScreen(pos: Vector3, camera: Camera, width: number, height: number): ScreenPos {
  v.copy(pos).project(camera)
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    visible: v.z > -1 && v.z < 1,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/projector.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write src/hud/panel.ts**

One panel instance reused for all nodes. Frosted glass, scale/fade in with overshoot (CSS). Tracks its node's projected position every frame and draws the leader line.

```ts
import type { Camera, Vector3 } from 'three'
import type { GalaxyNode, NodeAction } from '../nodes/registry'
import { toScreen } from './projector'

export interface Hud {
  open(node: GalaxyNode, anchor: Vector3): void
  close(): void
  openId(): string | null
  setLiveLines(nodeId: string, lines: string[]): void
  update(camera: Camera): void
}

export function createHud(root: HTMLElement, leaderSvg: SVGSVGElement): Hud {
  const el = document.createElement('div')
  el.className = 'hud-panel'
  el.setAttribute('role', 'dialog')
  root.appendChild(el)

  const line = leaderSvg.querySelector('line')!
  const live = new Map<string, string[]>()
  let current: { node: GalaxyNode; anchor: Vector3 } | null = null

  function render(node: GalaxyNode) {
    el.replaceChildren()
    const designation = document.createElement('div')
    designation.className = 'hud-designation'
    designation.textContent = node.designation
    const title = document.createElement('div')
    title.className = 'hud-title'
    title.textContent = node.label
    el.append(designation, title)

    for (const text of [...node.lines, ...(live.get(node.id) ?? [])]) {
      const p = document.createElement('div')
      p.className = 'hud-line'
      p.textContent = text
      el.append(p)
    }

    for (const action of node.actions) {
      el.append(actionButton(action))
    }
  }

  function actionButton(action: NodeAction): HTMLElement {
    if (action.kind === 'open') {
      const a = document.createElement('a')
      a.className = 'hud-action'
      a.textContent = action.label
      a.href = action.href
      if (!action.href.startsWith('mailto:')) {
        a.target = '_blank'
        a.rel = 'noopener'
      }
      return a
    }
    const b = document.createElement('button')
    b.className = 'hud-action'
    b.textContent = action.label
    b.addEventListener('click', async () => {
      await navigator.clipboard.writeText(action.text)
      b.textContent = 'Copied ✓'
      setTimeout(() => (b.textContent = action.label), 1500)
    })
    return b
  }

  return {
    open(node, anchor) {
      current = { node, anchor }
      render(node)
      el.classList.add('open')
      line.style.visibility = 'visible'
    },
    close() {
      current = null
      el.classList.remove('open')
      line.style.visibility = 'hidden'
    },
    openId: () => current?.node.id ?? null,
    setLiveLines(nodeId, lines) {
      live.set(nodeId, lines)
      if (current?.node.id === nodeId) render(current.node)
    },
    update(camera) {
      if (!current) return
      const s = toScreen(current.anchor, camera, innerWidth, innerHeight)
      if (!s.visible) return
      const px = Math.min(innerWidth - el.offsetWidth - 12, s.x + 28)
      const py = Math.max(12, s.y - el.offsetHeight - 20)
      el.style.transform = `translate(${px}px, ${py}px)`
      line.setAttribute('x1', String(s.x))
      line.setAttribute('y1', String(s.y))
      line.setAttribute('x2', String(px))
      line.setAttribute('y2', String(py + el.offsetHeight))
    },
  }
}
```

- [ ] **Step 6: Append panel styles to src/styles.css**

```css
.hud-panel {
  position: absolute; top: 0; left: 0; width: 230px; padding: 12px 14px;
  pointer-events: auto;
  background: linear-gradient(160deg, rgba(40, 70, 120, 0.35), rgba(10, 20, 45, 0.55));
  border: 1px solid rgba(140, 190, 255, 0.35); border-radius: 8px;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 24px rgba(50, 120, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  font-size: 12px; line-height: 1.5;
  opacity: 0; scale: 0.85; visibility: hidden;
  transform-origin: bottom left;
  transition: opacity 0.18s ease, scale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), visibility 0.18s;
}
.hud-panel.open { opacity: 1; scale: 1; visibility: visible; }

.hud-designation { font-size: 9px; letter-spacing: 2px; color: var(--hud-dim); }
.hud-title { margin-top: 4px; color: #fff; letter-spacing: 2px; font-size: 12px; }
.hud-line { margin-top: 5px; color: var(--hud-fg); }
.hud-line:first-of-type { color: #fff; }

.hud-action {
  display: block; margin-top: 9px; padding: 4px; text-align: center;
  font: inherit; font-size: 11px; color: #dceaff; text-decoration: none; cursor: pointer;
  background: rgba(120, 180, 255, 0.15);
  border: 1px solid rgba(140, 190, 255, 0.4); border-radius: 5px; width: 100%;
}
.hud-action:hover { background: rgba(120, 180, 255, 0.3); }

@media (prefers-reduced-motion: reduce) {
  .hud-panel { transition: opacity 0.18s ease, visibility 0.18s; }
}
```

- [ ] **Step 7: Typecheck and run unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, all tests pass. (The panel gets exercised in Task 10 wiring and the e2e suite; no DOM unit test here.)

- [ ] **Step 8: Commit**

```bash
git add src/hud tests/projector.test.ts src/styles.css
git commit -m "feat: frosted glass hud panel with projector and leader line"
```

---

### Task 10: Interaction: hover, tap, focus mode, keyboard

**Files:**
- Create: `src/camera/focus.ts`, `src/interaction.ts`
- Test: `tests/focus.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write the failing focus test**

```ts
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { focusedNode } from '../src/camera/focus'

const camera = new PerspectiveCamera(55, 2, 0.1, 200)
camera.position.set(0, 0, 10)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
camera.updateProjectionMatrix()

describe('focusedNode', () => {
  it('returns the node nearest screen center within threshold', () => {
    const id = focusedNode(
      [
        { id: 'a', position: new Vector3(0.1, 0, 0) },
        { id: 'b', position: new Vector3(3, 3, 0) },
      ],
      camera,
    )
    expect(id).toBe('a')
  })

  it('returns null when nothing is near center', () => {
    const id = focusedNode([{ id: 'b', position: new Vector3(6, 6, 0) }], camera)
    expect(id).toBeNull()
  })

  it('ignores nodes behind the camera', () => {
    const id = focusedNode([{ id: 'c', position: new Vector3(0, 0, 20) }], camera)
    expect(id).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/focus.test.ts`
Expected: FAIL, cannot resolve `../src/camera/focus`.

- [ ] **Step 3: Write src/camera/focus.ts**

```ts
import { Vector3, type Camera } from 'three'

const v = new Vector3()

export interface FocusCandidate {
  id: string
  position: Vector3
}

export function focusedNode(
  candidates: FocusCandidate[],
  camera: Camera,
  threshold = 0.22,
): string | null {
  let best: string | null = null
  let bestDist = threshold
  for (const c of candidates) {
    v.copy(c.position).project(camera)
    if (v.z <= -1 || v.z >= 1) continue
    const d = Math.hypot(v.x, v.y)
    if (d < bestDist) {
      bestDist = d
      best = c.id
    }
  }
  return best
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/focus.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write src/interaction.ts**

Single module that owns activation state. Priority: pointer (hover or tap) beats focus mode. Focus mode only acts when the pointer is not over a beacon. Keyboard tabs through hidden buttons.

```ts
import { Raycaster, Vector2 } from 'three'
import type { PerspectiveCamera } from 'three'
import { focusedNode } from './camera/focus'
import type { Beacons } from './nodes/beacons'
import { nodeById, NODES } from './nodes/registry'
import type { Hud } from './hud/panel'

export function wireInteraction(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  beacons: Beacons,
  hud: Hud,
): (dt: number) => void {
  const ray = new Raycaster()
  const pointer = new Vector2()
  let pointerOnCanvas = false
  let hoverId: string | null = null
  let pinnedId: string | null = null // set by tap/click/keyboard, survives focus drift

  function openNode(id: string) {
    hud.open(nodeById(id), beacons.worldPosition(id))
  }

  canvas.addEventListener('pointermove', (e) => {
    pointerOnCanvas = true
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  })
  canvas.addEventListener('pointerleave', () => {
    pointerOnCanvas = false
    hoverId = null
  })

  canvas.addEventListener('click', (e) => {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    ray.setFromCamera(pointer, camera)
    const hit = beacons.pick(ray)
    if (hit) {
      pinnedId = hit
      openNode(hit)
    } else {
      pinnedId = null
      hud.close()
    }
  })

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      pinnedId = null
      hud.close()
    }
  })

  // Hidden focusable buttons for keyboard access
  const tabs = document.getElementById('node-tabs')!
  for (const node of NODES) {
    const b = document.createElement('button')
    b.textContent = node.label
    b.addEventListener('focus', () => {
      pinnedId = node.id
      openNode(node.id)
    })
    b.addEventListener('click', () => {
      const primary = node.actions.find((a) => a.kind === 'open')
      if (primary) open(primary.href, '_blank', 'noopener')
    })
    tabs.append(b)
  }

  const candidates = NODES.map((n) => ({ id: n.id, position: beacons.worldPosition(n.id) }))

  return function update() {
    // hover (desktop)
    if (pointerOnCanvas) {
      ray.setFromCamera(pointer, camera)
      const hit = beacons.pick(ray)
      if (hit && hit !== hoverId) {
        hoverId = hit
        openNode(hit)
      } else if (!hit && hoverId) {
        hoverId = null
        if (!pinnedId) hud.close()
      }
    }

    // focus mode (rotating a node to screen center)
    if (!hoverId && !pinnedId) {
      const f = focusedNode(candidates, camera)
      if (f && hud.openId() !== f) openNode(f)
      else if (!f && hud.openId()) hud.close()
    }

    hud.update(camera)
  }
}
```

- [ ] **Step 6: Wire into src/main.ts**

Full final `init()` for reference (this is the complete file body except the try/catch wrapper, which stays):

```ts
import { createControls } from './camera/controls'
import { createHud } from './hud/panel'
import { createBeacons } from './nodes/beacons'
import { NODES } from './nodes/registry'
import { createScene, hasWebgl } from './scene'
import { wireInteraction } from './interaction'

function init() {
  if (!hasWebgl()) return

  const app = document.getElementById('app')!
  const sceneCtx = createScene(app, 60_000)
  const controls = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)

  const beacons = createBeacons(NODES)
  sceneCtx.scene.add(beacons.group)

  const hud = createHud(
    document.getElementById('hud')!,
    document.getElementById('leader') as unknown as SVGSVGElement,
  )
  const updateInteraction = wireInteraction(
    sceneCtx.camera,
    sceneCtx.renderer.domElement,
    beacons,
    hud,
  )

  let pulseT = 0
  sceneCtx.onFrame((dt) => {
    controls.update()
    pulseT += dt
    beacons.pulse(pulseT)
    updateInteraction(dt)
  })

  sceneCtx.start()
  document.getElementById('fallback')!.classList.add('hidden')
}
```

- [ ] **Step 7: Verify manually**

Run: `npm run dev`
Expected, desktop: hovering a beacon pops the glass panel with overshoot, leader line connects beacon to panel, panel tracks while orbiting. Click a beacon: panel stays (pinned) until Escape or clicking empty space. Slowly rotate a beacon to screen center with nothing pinned: panel fades in, drifts out when it leaves center. Tab cycles nodes and opens panels, Enter follows the primary link, Escape closes. Email panel Copy shows "Copied ✓".
Expected, mobile emulation (devtools): tap beacon opens, tap action follows, tap empty space dismisses.

- [ ] **Step 8: Run full suite, typecheck, commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: clean.

```bash
git add src/camera/focus.ts src/interaction.ts tests/focus.test.ts src/main.ts
git commit -m "feat: hover, tap, center-focus and keyboard node activation"
```

---

### Task 11: Live data wiring

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Wire data sources into init()**

Add to `src/main.ts` imports:

```ts
import { withCache } from './data/source'
import { githubSource } from './data/github'
```

Add at the end of `init()` (after `sceneCtx.start()`):

```ts
const sources = [withCache(githubSource)]
for (const source of sources) {
  source
    .fetchData()
    .then((data) => hud.setLiveLines(source.id, data.lines))
    .catch(() => hud.setLiveLines(source.id, ['live data unavailable']))
}
```

Note: `setLiveLines` keys by node id and `githubSource.id` is `'github'`, matching the github node's `dataSourceId`. Future sources attach the same way.

- [ ] **Step 2: Verify manually**

Run: `npm run dev`
Expected: GitHub panel shows a sparkline line like `▁▃▂▅▇▃▆▂▄▆ N commits · 30d` and `last push: Xh ago` under the static username line. Reload: data appears instantly (cache). In devtools, block `api.github.com` and clear localStorage key `nodedata:github`, reload: panel shows `live data unavailable`, no console error dialogs, page works.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: live github commit data in hud panel with graceful failure"
```

---

### Task 12: Adaptive quality

**Files:**
- Create: `src/quality.ts`
- Test: `tests/quality.test.ts`
- Modify: `src/main.ts`, `src/scene.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { FpsGovernor, pickInitialCount, TIERS } from '../src/quality'

describe('pickInitialCount', () => {
  it('gives desktops the top tier', () => {
    expect(pickInitialCount(2560, 1440, 10)).toBe(TIERS[0])
  })
  it('gives small screens or few cores a lower tier', () => {
    expect(pickInitialCount(390, 844, 6)).toBeLessThan(TIERS[0])
  })
})

describe('FpsGovernor', () => {
  it('steps down after sustained low fps', () => {
    const gov = new FpsGovernor(TIERS[0])
    let stepped: number | null = null
    // 4 seconds of 15 fps frames
    for (let i = 0; i < 60; i++) {
      const next = gov.update(1 / 15)
      if (next !== null) stepped = next
    }
    expect(stepped).toBe(TIERS[1])
  })

  it('does not step down on good fps', () => {
    const gov = new FpsGovernor(TIERS[0])
    for (let i = 0; i < 600; i++) {
      expect(gov.update(1 / 60)).toBeNull()
    }
  })

  it('stops at the lowest tier', () => {
    const gov = new FpsGovernor(TIERS[TIERS.length - 1])
    for (let i = 0; i < 600; i++) {
      expect(gov.update(1 / 10)).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/quality.test.ts`
Expected: FAIL, cannot resolve `../src/quality`.

- [ ] **Step 3: Write src/quality.ts**

```ts
export const TIERS = [60_000, 40_000, 25_000, 15_000] as const

const LOW_FPS = 28
const SUSTAIN_SECONDS = 3

export function pickInitialCount(width: number, height: number, cores: number): number {
  const pixels = width * height
  if (pixels >= 1_500_000 && cores >= 8) return TIERS[0]
  if (pixels >= 700_000 && cores >= 4) return TIERS[1]
  return TIERS[2]
}

export class FpsGovernor {
  private belowFor = 0
  private tierIndex: number

  constructor(currentCount: number) {
    this.tierIndex = Math.max(0, TIERS.findIndex((t) => t <= currentCount))
  }

  /** Returns a new particle count when a step down is due, else null. */
  update(dt: number): number | null {
    if (this.tierIndex >= TIERS.length - 1) return null
    const fps = 1 / Math.max(dt, 1e-6)
    this.belowFor = fps < LOW_FPS ? this.belowFor + dt : 0
    if (this.belowFor >= SUSTAIN_SECONDS) {
      this.belowFor = 0
      this.tierIndex += 1
      return TIERS[this.tierIndex]
    }
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/quality.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Use it in src/main.ts**

Replace the hardcoded `60_000`:

```ts
import { FpsGovernor, pickInitialCount } from './quality'

const count = pickInitialCount(innerWidth, innerHeight, navigator.hardwareConcurrency ?? 4)
const sceneCtx = createScene(app, count)
const governor = new FpsGovernor(count)
```

And inside the existing `sceneCtx.onFrame` callback, first line:

```ts
const stepDown = governor.update(dt)
if (stepDown !== null) sceneCtx.galaxy.rebuild(stepDown)
```

- [ ] **Step 6: Verify manually**

Run: `npm run dev`
Expected: normal machines see no change. In devtools, enable CPU throttling (20x) for several seconds: console stays clean and the galaxy visibly thins (rebuild to a lower tier) instead of stuttering forever. Remove throttling; galaxy stays at the lower tier (no oscillation by design).

- [ ] **Step 7: Run full suite, typecheck, commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: clean.

```bash
git add src/quality.ts tests/quality.test.ts src/main.ts
git commit -m "feat: adaptive particle count with fps governor"
```

---

### Task 13: WebGL context loss handling

**Files:**
- Modify: `src/scene.ts`, `src/styles.css`

- [ ] **Step 1: Handle context loss in createScene**

Add inside `createScene`, after the `let running = true` declaration (the
listener references `running`):

```ts
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()
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
```

- [ ] **Step 2: Add positioning style to src/styles.css**

```css
.context-lost {
  top: 50%; left: 50%; transform: translate(-50%, -50%);
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. In the devtools console:

```js
document.querySelector('#app canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()
```

Expected: rendering stops, centered glass panel reads RENDER LINK LOST with a Reload button that reloads the page.

- [ ] **Step 4: Typecheck, commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/scene.ts src/styles.css
git commit -m "feat: webgl context loss prompt"
```

---

### Task 14: Playwright smoke tests

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Install browsers**

Run: `npx playwright install chromium firefox`
Expected: both browsers download.

- [ ] **Step 2: Write playwright.config.ts**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
```

- [ ] **Step 3: Write e2e/smoke.spec.ts**

Also add `include: ['tests/**/*.test.ts']` to the `test` block of vite.config.ts
so vitest does not try to execute the Playwright spec.

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => {
    const events = [
      {
        type: 'PushEvent',
        created_at: new Date(Date.now() - 3_600_000).toISOString(),
        payload: { size: 7 },
      },
    ]
    return route.fulfill({ json: events })
  })
})

test('renders the galaxy and hides the fallback', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await expect(page.locator('#fallback')).toBeHidden()
  const frames = async () => page.evaluate(() => window.__frameCount ?? 0)
  const before = await frames()
  await page.waitForTimeout(500)
  expect(await frames()).toBeGreaterThan(before)
})

test('keyboard opens each node panel', async ({ page }) => {
  await page.goto('/')
  for (const label of ['GITHUB', 'EMAIL', 'LINKEDIN']) {
    await page.getByRole('button', { name: label }).focus()
    await expect(page.locator('.hud-panel')).toHaveClass(/open/)
    await expect(page.locator('.hud-title')).toHaveText(label)
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('.hud-panel')).not.toHaveClass(/open/)
})

test('github panel shows live commit data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'GITHUB' }).focus()
  await expect(page.locator('.hud-panel')).toContainText('7 commits')
  await expect(page.locator('.hud-panel')).toContainText('last push: 1h ago')
})

test('fallback shows when webgl is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    // @ts-expect-error override for test
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2') return null
      return original.call(this, type, ...args)
    }
  })
  await page.goto('/')
  await expect(page.locator('#fallback')).toBeVisible()
  await expect(page.locator('#fallback .glass-card').first()).toHaveAttribute(
    'href',
    'https://github.com/bshandley',
  )
})
```

Note: `window.__frameCount` needs the global declaration from `src/scene.ts`; if tsc complains in e2e, add `"e2e"` to tsconfig `include`.

- [ ] **Step 4: Run the e2e suite**

Run: `npx playwright test`
Expected: 8 passed (4 tests x 2 browsers). The live-data test depends on localStorage being empty per fresh context, which Playwright guarantees.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e
git commit -m "test: playwright smoke suite for chromium and firefox"
```

---

### Task 15: GitHub Pages deploy

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: Write .github/workflows/deploy.yml**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write README.md**

```markdown
# handley.io

Landing page: a swirling WebGL particle galaxy with link nodes.

- Spec: docs/superpowers/specs/2026-06-10-galaxy-homepage-design.md
- Dev: `npm run dev`
- Unit tests: `npm test`
- E2E: `npm run e2e` (needs `npx playwright install chromium firefox` once)
- Deploys to GitHub Pages from main via .github/workflows/deploy.yml
```

- [ ] **Step 3: Create the GitHub repo and push (needs user confirmation for the public repo name)**

```bash
gh repo create bshandley/handleyio --public --source . --push
```

Then in the repo settings (or via CLI): Settings > Pages > Source: GitHub Actions. The CNAME file in `public/` sets the custom domain; DNS for handley.io must point at GitHub Pages (A records 185.199.108.153 .109 .110 .111 or an ALIAS/CNAME to bshandley.github.io).

- [ ] **Step 4: Verify deploy**

Run: `gh run watch`
Expected: build and deploy jobs green. Visit the Pages URL: galaxy renders.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "ci: github pages deploy workflow"
git push
```

---

## Self-review notes

- Spec coverage: hybrid art direction (Tasks 5, 6, 8), frosted glass panel (Task 9), orbit momentum camera and idle drift (Task 7), focus/hover/tap/keyboard activation (Task 10), live GitHub data with cache and graceful failure (Tasks 3, 4, 11), wordmark (Task 1), adaptive quality, DPR cap, visibility pause, reduced motion (Tasks 6, 12), no-WebGL fallback and JS-failure-safe links (Tasks 1, 6, 14), context loss (Task 13), Vitest + Playwright on Chromium and Firefox (Tasks 2-5, 8-10, 12, 14), GitHub Pages (Task 15).
- Spec deviation, intentional: no separate `fallback/` module. The fallback is static HTML in index.html plus a `hidden` class toggle, which is strictly more robust (works with JS disabled). Spec's intent (links always reachable) is preserved.
- The `dataSourceId` field on nodes documents which source feeds which node; the wiring in Task 11 matches `source.id` to the panel's live-lines key, and the registry test pins `github` to `github`.
