# v1.3 Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1.3 round: panel-visibility state machine, identity block + meta/SEO, first-visit hint, mobile audit with fixes, plus the folded-in BRA-54 robustness and BRA-55 CI work.

**Architecture:** Panel visibility moves into a pure, mutating-in-place reducer (`src/interaction/panelstate.ts`) driven by `interaction.ts`, which shrinks to a DOM/raycast adapter. Identity and meta are static HTML. The hint is a small model class (unit-testable, no DOM) plus thin DOM wiring. CI gains an e2e job; mobile gains Playwright device projects.

**Tech Stack:** Vite, vanilla TypeScript, Three.js, Vitest, Playwright, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-06-11-v13-refinements-design.md

**Design notes locked during planning:**
- The spec says `step(state, inputs) returns the next state`. The render loop's zero-per-frame-allocation rule makes a fresh state object per frame wrong, so `step` mutates the state in place and returns void. Steady-state frames allocate nothing; mode objects are allocated only on transitions. Record this as a spec deviation in the ship task.
- The reducer normalizes one v1 quirk: today, ANY node dwelling in the focus zone holds an unrelated lingering panel open (the `if (f) graceT = 0` branch). In the reducer, only the focus panel's own node holds it. Record as a deviation.

**Task ordering:** CI work first (GitHub forces Node 24 on deprecated action versions 2026-06-16), then the state machine (riskiest), then robustness, content, hint, mobile.

---

### Task 1: Bump deprecated actions and run e2e in CI (BRA-55 part 1)

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Confirm current latest majors**

Run:
```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
gh api repos/actions/setup-node/releases/latest --jq .tag_name
gh api repos/actions/upload-pages-artifact/releases/latest --jq .tag_name
gh api repos/actions/deploy-pages/releases/latest --jq .tag_name
```
Expected: tag names like `v5.x.x` / `v4.x.x`. Use each action's latest major below; the YAML in Step 2 assumes checkout v5, setup-node v5, upload-pages-artifact v4, deploy-pages v4. If a latest major differs, substitute it.

- [ ] **Step 2: Rewrite deploy.yml with bumped actions and an e2e job**

Replace the full contents of `.github/workflows/deploy.yml` with:

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
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium firefox webkit
      - run: npm run e2e

  deploy:
    needs: [build, e2e]
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Note: webkit is installed now because Task 11 adds an iPhone-emulation project; installing it from the start avoids editing this file twice.

- [ ] **Step 3: Validate the workflow locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('yaml ok')"`
Expected: `yaml ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: bump actions off deprecated Node 20, run e2e suite before deploy (BRA-55)"
```

Do not push yet; the push happens in the ship task after local suites pass.

---

### Task 2: Fix the frame-count flake with expect.poll (BRA-55 part 2)

**Files:**
- Modify: `e2e/smoke.spec.ts:22-30`

- [ ] **Step 1: Replace the fixed 500ms wait**

In `e2e/smoke.spec.ts`, replace the first test:

```ts
test('renders the galaxy and hides the fallback', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await expect(page.locator('#fallback')).toBeHidden()
  const frames = async () => page.evaluate(() => window.__frameCount ?? 0)
  const before = await frames()
  await expect.poll(frames, { timeout: 5000 }).toBeGreaterThan(before)
})
```

- [ ] **Step 2: Kill stale preview servers, then run the test**

Run:
```bash
lsof -ti:4173 | xargs kill 2>/dev/null; npx playwright test smoke.spec.ts -g "renders the galaxy" 2>&1 | tail -5
```
Expected: `2 passed` (chromium + firefox).

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test: poll frame count instead of fixed wait (BRA-55)"
```

---

### Task 3: Beacon screen-position test hook and click-on-beacon e2e (BRA-55 part 3)

**Files:**
- Modify: `src/main.ts`
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Find how __frameCount is declared**

Run: `grep -rn "__frameCount" src e2e *.d.ts 2>/dev/null`
Expected: a declaration site (likely a `declare global` block or an `(window as any)` assignment in `src/scene.ts`). Mirror whichever pattern exists for the new hook.

- [ ] **Step 2: Expose a beacon screen-position hook in main.ts**

In `src/main.ts`, after the `createNodeNav(...)` call inside `init()`, add:

```ts
  // e2e hook: screen-space position of a beacon (test-only, allocates)
  ;(window as unknown as Record<string, unknown>).__nodeScreen = (id: string) => {
    const v = beacons.worldPosition(id).clone().project(sceneCtx.camera)
    return {
      x: ((v.x + 1) / 2) * innerWidth,
      y: ((1 - v.y) / 2) * innerHeight,
    }
  }
```

If Step 1 found a `declare global` block, add `__nodeScreen?: (id: string) => { x: number; y: number }` to it and drop the cast.

- [ ] **Step 3: Add the click-on-beacon test**

Append to `e2e/smoke.spec.ts`:

```ts
test('clicking a beacon opens its panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const pos = await page.evaluate(() =>
    (window as unknown as Record<string, (id: string) => { x: number; y: number }>)
      .__nodeScreen('github'),
  )
  await page.mouse.click(pos.x, pos.y)
  await expect(page.locator('.hud-panel')).toHaveClass(/open/)
  await expect(page.locator('.hud-title')).toHaveText('GITHUB')
})
```

- [ ] **Step 4: Run it**

Run: `lsof -ti:4173 | xargs kill 2>/dev/null; npx playwright test smoke.spec.ts -g "clicking a beacon" 2>&1 | tail -5`
Expected: `2 passed`. If it flakes because the beacon moved between evaluate and click, re-fetch the position immediately before the click inside the same test (the orbit is slow; one fetch is normally enough).

- [ ] **Step 5: Run the full e2e suite and commit**

Run: `lsof -ti:4173 | xargs kill 2>/dev/null; set -o pipefail; npm run e2e 2>&1 | tail -5`
Expected: all tests pass (16 = 8 tests x 2 browsers).

```bash
git add src/main.ts e2e/smoke.spec.ts
git commit -m "test: click-on-beacon e2e via __nodeScreen hook (BRA-55)"
```

---

### Task 4: Panel state machine: types, hover, grace (TDD)

**Files:**
- Create: `src/interaction/panelstate.ts`
- Create: `tests/panelstate.test.ts`

The reducer is pure logic: no Three, no DOM. It mutates the state object in place (zero-allocation render loop rule); mode objects are allocated only on transitions.

- [ ] **Step 1: Write the failing tests**

Create `tests/panelstate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CLOSE_GRACE,
  initialState,
  step,
  visibleId,
  type FrameInputs,
  type PanelEvent,
  type PanelState,
} from '../src/interaction/panelstate'

const DT = 1 / 60

function frame(over: Partial<FrameInputs> = {}): FrameInputs {
  return {
    dt: DT,
    hitId: null,
    pointerOverPanel: false,
    focusId: null,
    userActive: false,
    events: [],
    ...over,
  }
}

function runFrames(s: PanelState, n: number, over: Partial<FrameInputs> = {}): void {
  for (let i = 0; i < n; i++) step(s, frame(over))
}

function fire(s: PanelState, ...events: PanelEvent[]): void {
  step(s, frame({ events }))
}

describe('panelstate: hover', () => {
  it('starts closed', () => {
    expect(visibleId(initialState())).toBeNull()
  })

  it('opens on hover and stays while the pointer is on the beacon', () => {
    const s = initialState()
    runFrames(s, 5, { hitId: 'github' })
    expect(visibleId(s)).toBe('github')
  })

  it('switches hover target immediately', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    runFrames(s, 1, { hitId: 'email' })
    expect(visibleId(s)).toBe('email')
  })

  it('closes a hover panel only after the grace window', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    runFrames(s, Math.floor(CLOSE_GRACE / DT) - 2, {})
    expect(visibleId(s)).toBe('github') // still inside grace
    runFrames(s, 10, {})
    expect(visibleId(s)).toBeNull()
  })

  it('the pointer resting on the panel holds it open past grace', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    runFrames(s, 120, { pointerOverPanel: true })
    expect(visibleId(s)).toBe('github')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/panelstate.test.ts 2>&1 | tail -5`
Expected: FAIL, cannot resolve `../src/interaction/panelstate`.

- [ ] **Step 3: Implement the module**

Create `src/interaction/panelstate.ts`:

```ts
// Panel-visibility state machine. Pure logic: no Three, no DOM.
// step() mutates the state in place: the render loop allows zero
// per-frame allocations, so a fresh state object per frame is out.
// Mode objects are allocated only on transitions.

export type Mode =
  | { kind: 'closed' }
  | { kind: 'hover'; id: string; returnTo: string | null }
  | { kind: 'pinned'; id: string }
  | { kind: 'focus'; id: string }

export interface PanelState {
  mode: Mode
  /** Counts up while nothing claims an open panel; closes it past CLOSE_GRACE. */
  graceT: number
  /** Post-dismissal window blocking focus-opens for nodes sweeping center. */
  suppressT: number
  /** Dismissed node: focus may not reopen it until it leaves the focus zone. */
  dismissedId: string | null
}

export type PanelEvent =
  | { type: 'click'; id: string }
  | { type: 'clickEmpty' }
  | { type: 'escape' }
  | { type: 'pin'; id: string }
  | { type: 'clear' }

export interface FrameInputs {
  dt: number
  /** Beacon under the pointer (null when none, or pointer off canvas). */
  hitId: string | null
  pointerOverPanel: boolean
  /** Node inside the screen-center focus zone. */
  focusId: string | null
  /** User-driven camera motion within the idle window (rig.userActive). */
  userActive: boolean
  /** Discrete events since the previous frame; cleared by the caller. */
  events: PanelEvent[]
}

export const CLOSE_GRACE = 0.35
export const FOCUS_SUPPRESS = 1.0

const CLOSED: Mode = { kind: 'closed' } // shared: modes are never mutated

export function initialState(): PanelState {
  return { mode: CLOSED, graceT: 0, suppressT: 0, dismissedId: null }
}

export function visibleId(s: PanelState): string | null {
  return s.mode.kind === 'closed' ? null : s.mode.id
}

function pinOf(m: Mode): string | null {
  if (m.kind === 'pinned') return m.id
  if (m.kind === 'hover') return m.returnTo
  return null
}

export function step(s: PanelState, f: FrameInputs): void {
  // 1. Discrete events first: explicit intent beats continuous inputs.
  for (const e of f.events) {
    if (e.type === 'click' || e.type === 'pin') {
      s.mode = { kind: 'pinned', id: e.id }
    } else {
      // clickEmpty | escape | clear: explicit dismissal. Spec: hold the
      // focused node until it leaves the zone, plus a sweep timer.
      s.mode = CLOSED
      s.suppressT = FOCUS_SUPPRESS
      s.dismissedId = f.focusId
    }
    s.graceT = 0
  }

  // 2. Timers; release the dismissal once the node leaves the zone.
  if (s.suppressT > 0) s.suppressT = Math.max(0, s.suppressT - f.dt)
  if (s.dismissedId !== null && f.focusId !== s.dismissedId) s.dismissedId = null

  // 3. Hover wins over everything visible.
  if (f.hitId !== null) {
    if (!(s.mode.kind === 'hover' && s.mode.id === f.hitId)) {
      s.mode = { kind: 'hover', id: f.hitId, returnTo: pinOf(s.mode) }
    }
    s.graceT = 0
    return
  }

  // 4. Hover ended: restore the pinned panel immediately, if any.
  if (s.mode.kind === 'hover' && s.mode.returnTo !== null) {
    s.mode = { kind: 'pinned', id: s.mode.returnTo }
  }

  // 5. Pinned panels stay; the pointer resting on the panel holds it too.
  if (s.mode.kind === 'pinned' || f.pointerOverPanel) {
    s.graceT = 0
    return
  }

  // 6. An open focus panel holds while its node stays centered (the user
  // stopped to read; idle decay of userActive must not close it).
  if (s.mode.kind === 'focus' && s.mode.id === f.focusId) {
    s.graceT = 0
    return
  }

  // 7. Focus-open: user-driven centering only, never a dismissed node.
  if (
    f.focusId !== null &&
    f.userActive &&
    s.suppressT === 0 &&
    f.focusId !== s.dismissedId
  ) {
    s.mode = { kind: 'focus', id: f.focusId }
    s.graceT = 0
    return
  }

  // 8. Nothing claims the panel: close it after the grace window.
  if (s.mode.kind !== 'closed') {
    s.graceT += f.dt
    if (s.graceT > CLOSE_GRACE) {
      s.mode = CLOSED
      s.graceT = 0
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/panelstate.test.ts 2>&1 | tail -5`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/interaction/panelstate.ts tests/panelstate.test.ts
git commit -m "feat: panel-visibility state machine, hover + grace semantics"
```

---

### Task 5: State machine: click, pin, dismissal, focus (TDD)

**Files:**
- Modify: `tests/panelstate.test.ts`
- Modify: `src/interaction/panelstate.ts` (only if a test exposes a bug)

The implementation from Task 4 already contains the logic; this task pins the event and focus semantics with tests. TDD discipline still applies: add each describe block, run, and only then move on. If any test fails, fix the reducer, not the test, unless the test contradicts the spec.

- [ ] **Step 1: Add click/pin/dismiss tests**

Append to `tests/panelstate.test.ts`:

```ts
describe('panelstate: click and pin', () => {
  it('click pins the panel; it survives idle frames', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    runFrames(s, 600, {})
    expect(visibleId(s)).toBe('email')
  })

  it('hovering another node shows it, then the pin restores', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    runFrames(s, 2, { hitId: 'github' })
    expect(visibleId(s)).toBe('github')
    runFrames(s, 1, {})
    expect(visibleId(s)).toBe('email') // immediate restore, no grace
  })

  it('escape closes a pinned panel', () => {
    const s = initialState()
    fire(s, { type: 'pin', id: 'email' })
    fire(s, { type: 'escape' })
    expect(visibleId(s)).toBeNull()
  })

  it('empty click closes a pinned panel', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    fire(s, { type: 'clickEmpty' })
    expect(visibleId(s)).toBeNull()
  })
})

describe('panelstate: focus mode', () => {
  it('opens when the user centers a node', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBe('pliny')
  })

  it('never opens without user activity', () => {
    const s = initialState()
    runFrames(s, 3600, { focusId: 'pliny', userActive: false })
    expect(visibleId(s)).toBeNull()
  })

  it('stays open while the node is centered after activity decays', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    runFrames(s, 600, { focusId: 'pliny', userActive: false })
    expect(visibleId(s)).toBe('pliny')
  })

  it('closes after grace when the node leaves the zone', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    runFrames(s, Math.ceil(CLOSE_GRACE / (1 / 60)) + 2, {})
    expect(visibleId(s)).toBeNull()
  })

  it('does not hold an unrelated lingering panel open (v1 quirk, normalized)', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    // github hover ends, pliny dwells in the zone without user activity
    runFrames(s, Math.ceil(CLOSE_GRACE / (1 / 60)) + 2, { focusId: 'pliny' })
    expect(visibleId(s)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/panelstate.test.ts 2>&1 | tail -5`
Expected: PASS (14 tests). On failure: re-read steps 1-8 of `step()` against the failing expectation, fix the reducer.

- [ ] **Step 3: Commit**

```bash
git add tests/panelstate.test.ts
git commit -m "test: pin click/pin/dismiss/focus semantics of panel state machine"
```

---

### Task 6: State machine: BRA-61/62/63 regression scenarios (TDD)

**Files:**
- Modify: `tests/panelstate.test.ts`

- [ ] **Step 1: Add the named regression scenarios**

Append to `tests/panelstate.test.ts`:

```ts
describe('panelstate: production regressions', () => {
  it('BRA-61: a dismissed node cannot focus-reopen during its whole dwell', () => {
    const s = initialState()
    // user rotates pliny to center, focus opens
    runFrames(s, 5, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBe('pliny')
    // user clicks empty space to dismiss while pliny is still centered
    step(s, frame({ focusId: 'pliny', userActive: true, events: [{ type: 'clickEmpty' }] }))
    // pliny dwells in the zone for 60 simulated seconds, user stays active
    runFrames(s, 3600, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBeNull()
    // pliny leaves the zone, then comes back with the user active: reopens
    runFrames(s, 120, { userActive: true })
    runFrames(s, 5, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBe('pliny')
  })

  it('BRA-62: page load with a node in the zone and idle drift never opens', () => {
    const s = initialState()
    // wide-aspect load: pliny sits in the zone from frame zero, no user input
    runFrames(s, 18000, { focusId: 'pliny', userActive: false }) // 5 sim-minutes
    expect(visibleId(s)).toBeNull()
  })

  it('BRA-63: a stationary press-release (empty click) opens nothing', () => {
    const s = initialState()
    runFrames(s, 60, { focusId: 'pliny' })
    // stationary click on empty space: no pointer travel, so never userActive
    step(s, frame({ focusId: 'pliny', events: [{ type: 'clickEmpty' }] }))
    runFrames(s, 600, { focusId: 'pliny', userActive: false })
    expect(visibleId(s)).toBeNull()
  })

  it('chevron flight: dismissal suppresses nodes sweeping the center', () => {
    const s = initialState()
    fire(s, { type: 'clear' }) // flight start closes any panel
    // during the 1s sweep window other nodes transit the zone; the camera
    // motion is not user-driven, and even if it were, suppression holds
    runFrames(s, 30, { focusId: 'email', userActive: true }) // 0.5s
    expect(visibleId(s)).toBeNull()
    // arrival pins the target
    fire(s, { type: 'pin', id: 'github' })
    expect(visibleId(s)).toBe('github')
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/panelstate.test.ts 2>&1 | tail -5`
Expected: PASS (18 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/panelstate.test.ts
git commit -m "test: BRA-61/62/63 regression scenarios against the state machine"
```

---

### Task 7: Rewrite interaction.ts as an adapter; retire createFocusGate

**Files:**
- Modify: `src/interaction.ts` (full rewrite)
- Modify: `src/camera/focus.ts` (delete `createFocusGate` and `FocusGate`)
- Modify: `tests/focus.test.ts` (drop gate tests, keep `focusedNode` tests)

- [ ] **Step 1: Rewrite src/interaction.ts**

Replace the full contents of `src/interaction.ts` with:

```ts
import { Raycaster, Vector2 } from 'three'
import type { PerspectiveCamera } from 'three'
import { focusedNode } from './camera/focus'
import {
  initialState,
  step,
  visibleId,
  type FrameInputs,
  type PanelEvent,
} from './interaction/panelstate'
import type { Beacons } from './nodes/beacons'
import { nodeById, NODES } from './nodes/registry'
import type { Hud } from './hud/panel'

export interface Interaction {
  update(dt: number): void
  /** Open a node's panel and keep it open (used by chevron navigation). */
  pin(id: string): void
  /** Close any open panel and forget the pin (chevron flight start). */
  clear(): void
}

// Adapter: DOM events and raycasts in, HUD open/close out. All visibility
// decisions live in interaction/panelstate.ts.
export function wireInteraction(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  beacons: Beacons,
  hud: Hud,
  userActive: () => boolean,
): Interaction {
  const ray = new Raycaster()
  const pointer = new Vector2()
  let pointerOnCanvas = false
  let downX = 0
  let downY = 0

  const state = initialState()
  const events: PanelEvent[] = []
  const inputs: FrameInputs = {
    dt: 0,
    hitId: null,
    pointerOverPanel: false,
    focusId: null,
    userActive: false,
    events,
  }

  const candidates = NODES.map((n) => ({ id: n.id, position: beacons.worldPosition(n.id) }))

  canvas.addEventListener('pointermove', (e) => {
    pointerOnCanvas = true
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  })
  canvas.addEventListener('pointerleave', () => {
    pointerOnCanvas = false
  })
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX
    downY = e.clientY
  })

  canvas.addEventListener('click', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    ray.setFromCamera(pointer, camera)
    const hit = beacons.pick(ray)
    events.push(hit ? { type: 'click', id: hit } : { type: 'clickEmpty' })
  })

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') events.push({ type: 'escape' })
  })

  // Hidden focusable buttons for keyboard access
  const tabs = document.getElementById('node-tabs')!
  for (const node of NODES) {
    const b = document.createElement('button')
    b.textContent = node.label
    b.addEventListener('focus', () => {
      events.push({ type: 'pin', id: node.id })
    })
    b.addEventListener('click', () => {
      const primary = node.actions.find((a) => a.kind === 'open')
      if (primary) open(primary.href, '_blank', 'noopener')
    })
    tabs.append(b)
  }

  function update(dt: number) {
    inputs.dt = dt
    inputs.hitId = null
    if (pointerOnCanvas) {
      ray.setFromCamera(pointer, camera)
      inputs.hitId = beacons.pick(ray)
    }
    inputs.pointerOverPanel = hud.pointerOver()
    inputs.focusId = focusedNode(candidates, camera)
    inputs.userActive = userActive()

    const prev = visibleId(state)
    step(state, inputs)
    events.length = 0
    const next = visibleId(state)
    if (next !== prev) {
      if (next) hud.open(nodeById(next), beacons.worldPosition(next))
      else hud.close()
    }

    hud.update(camera)
  }

  return {
    update,
    pin(id) {
      events.push({ type: 'pin', id })
    },
    clear() {
      events.push({ type: 'clear' })
    },
  }
}
```

Behavioral note: `pin()`/`clear()`/keyboard focus now apply on the next frame (≤16ms later) instead of synchronously. Visually indistinguishable; the keyboard e2e tests assert via locator waits and are unaffected.

- [ ] **Step 2: Delete the gate from focus.ts**

In `src/camera/focus.ts`, delete the `FocusGate` interface, the `createFocusGate` function, and the comment block above it (lines 10-32 of the current file). Keep `FocusCandidate` and `focusedNode` unchanged. The dismissal/suppression semantics they implemented now live in `panelstate.ts` steps 1, 2, and 7.

- [ ] **Step 3: Update tests/focus.test.ts**

Run: `grep -n "createFocusGate\|FocusGate" tests/focus.test.ts`
Delete every test (and import) referencing the gate; keep all `focusedNode` tests. The gate behaviors are covered by `tests/panelstate.test.ts` (dismissal hold in the BRA-61 scenario, userActive requirement in the BRA-62 scenario).

- [ ] **Step 4: Typecheck and run both suites**

Run:
```bash
set -o pipefail
npm run build 2>&1 | tail -3 && npx vitest run 2>&1 | tail -4
lsof -ti:4173 | xargs kill 2>/dev/null; npm run e2e 2>&1 | tail -4
```
Expected: build clean, all vitest pass, all e2e pass (the BRA-61/62/63 e2e guards prove the adapter preserves production behavior).

- [ ] **Step 5: Commit**

```bash
git add src/interaction.ts src/camera/focus.ts tests/focus.test.ts
git commit -m "refactor: interaction.ts is now an adapter over the panel state machine"
```

---

### Task 8: BRA-54 robustness: storage and clipboard

**Files:**
- Modify: `src/data/source.ts`
- Modify: `src/hud/panel.ts:69-73`
- Modify: `src/main.ts`
- Modify: `tests/source.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/source.test.ts` (match the file's existing fake-storage helpers; it already injects `StorageLike` and a clock):

```ts
import { safeStorage } from '../src/data/source'

describe('withCache storage failures', () => {
  it('a setItem quota error still returns the fresh fetch', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const source = withCache(
      { id: 'x', ttlMs: 1000, fetchData: async () => ({ lines: ['fresh'] }) },
      storage,
      () => 0,
    )
    await expect(source.fetchData()).resolves.toEqual({ lines: ['fresh'] })
  })
})

describe('safeStorage', () => {
  it('falls back to in-memory storage when localStorage is unusable', () => {
    // vitest runs in node: real localStorage access throws or is undefined
    const s = safeStorage()
    s.setItem('k', 'v')
    expect(s.getItem('k')).toBe('v')
    expect(s.getItem('missing')).toBeNull()
  })
})
```

Adjust the imports line to merge with the file's existing imports from `../src/data/source`.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/source.test.ts 2>&1 | tail -5`
Expected: FAIL: `safeStorage` is not exported, and the quota test rejects.

- [ ] **Step 3: Fix source.ts**

In `src/data/source.ts`, wrap the `setItem` call (currently after the try block) so a write failure cannot reject a successful fetch:

```ts
      const v = await source.fetchData()
      try {
        storage.setItem(key, JSON.stringify({ t: now(), v }))
      } catch {
        // storage full or blocked: serve the fresh data uncached
      }
      return v
```

Then add `safeStorage` and use it as the default, so evaluating the default parameter can never throw during init (the BRA-54 blocked-storage crash):

```ts
/** localStorage when usable, otherwise an in-memory stand-in (BRA-54). */
export function safeStorage(): StorageLike {
  try {
    const probe = '__handleyio_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v)
      },
    }
  }
}
```

Change the `withCache` signature default from `storage: StorageLike = localStorage` to `storage: StorageLike = safeStorage()`.

- [ ] **Step 4: Guard the clipboard action in panel.ts**

In `src/hud/panel.ts`, replace the copy-button click handler body:

```ts
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(action.text)
        b.textContent = 'Copied ✓'
      } catch {
        b.textContent = 'Copy failed'
      }
      setTimeout(() => (b.textContent = action.label), 1500)
    })
```

- [ ] **Step 5: Hide the fallback before wiring data sources in main.ts**

In `src/main.ts`, move the line `document.getElementById('fallback')!.classList.add('hidden')` from the end of `init()` to immediately after `sceneCtx.start()`, so a failure in source wiring can never leave the fallback covering a working galaxy.

- [ ] **Step 6: Run suites and commit**

Run: `set -o pipefail; npm run build 2>&1 | tail -3 && npx vitest run 2>&1 | tail -4`
Expected: clean build, all pass.

```bash
git add src/data/source.ts src/hud/panel.ts src/main.ts tests/source.test.ts
git commit -m "fix: survive blocked/full storage and clipboard failures (BRA-54)"
```

---

### Task 9: Identity block, LinkedIn headline, meta tags, JSON-LD

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css:26-30,116`
- Modify: `src/nodes/registry.ts:41`
- Modify: `tests/registry.test.ts`
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Update the head of index.html**

Replace the `<title>` and meta lines in `index.html` with:

```html
    <title>Bradley Handley · handley.io</title>
    <meta name="description" content="Bradley Handley. Cloud security leader. Builder of Pliny and Gatehouse." />
    <meta property="og:title" content="Bradley Handley · handley.io" />
    <meta property="og:description" content="Bradley Handley. Cloud security leader. Builder of Pliny and Gatehouse." />
    <meta property="og:url" content="https://handley.io/" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://handley.io/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": "Bradley Handley",
        "url": "https://handley.io",
        "jobTitle": "Cloud Security Leader",
        "sameAs": [
          "https://github.com/bshandley",
          "https://www.linkedin.com/in/bshandley/"
        ]
      }
    </script>
```

(`og.png` is captured in Task 10; the tag landing one task early is harmless.)

- [ ] **Step 2: Grow the wordmark into the identity block**

In `index.html`, replace `<div id="wordmark">handley.io</div>` with:

```html
    <div id="wordmark">
      <div class="id-site">handley.io</div>
      <div class="id-name">Bradley Handley</div>
      <div class="id-line">Cloud security leader. After hours tinkerer. Perpetually tired.</div>
    </div>
```

Source text stays natural-case for crawlers; CSS uppercases it.

- [ ] **Step 3: Style it and clear the telemetry collision**

In `src/styles.css`, replace the `#wordmark` rule with:

```css
#wordmark {
  position: fixed; left: 16px; bottom: 14px; z-index: 4;
  letter-spacing: 2px; color: var(--hud-dim);
  user-select: none; text-transform: uppercase; line-height: 1.8;
}
#wordmark .id-site { font-size: 13px; }
#wordmark .id-name { font-size: 12px; letter-spacing: 2px; color: var(--hud-fg); }
#wordmark .id-line { font-size: 10px; letter-spacing: 1.5px; }
```

The identity block is now ~3 lines tall; move the bottom-left telemetry (NODES/LINK line) clear of it. Change `.hud-tele-bl { bottom: 36px; left: 16px; }` to:

```css
.hud-tele-bl { bottom: 84px; left: 16px; }
```

- [ ] **Step 4: LinkedIn headline in the registry (closes the BRA-54 needs-bradley item)**

In `src/nodes/registry.ts`, change the linkedin node's `lines` from `['Bradley Handley']` to:

```ts
    lines: ['Bradley Handley', 'Cloud security leader'],
```

Update the matching expectation in `tests/registry.test.ts` (run `grep -n "Bradley Handley" tests/registry.test.ts` to find it; if no test asserts the lines, add one):

```ts
  it('linkedin panel carries the headline', () => {
    expect(nodeById('linkedin').lines).toEqual(['Bradley Handley', 'Cloud security leader'])
  })
```

- [ ] **Step 5: Pin the meta and identity with an e2e test**

Append to `e2e/smoke.spec.ts`:

```ts
test('identity and meta are present', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Bradley Handley · handley.io')
  await expect(page.locator('#wordmark .id-name')).toHaveText('Bradley Handley')
  await expect(page.locator('#wordmark .id-line')).toContainText('Perpetually tired')
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe(
    'https://handley.io/og.png',
  )
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText())
  expect(ld['@type']).toBe('Person')
  expect(ld.name).toBe('Bradley Handley')
})
```

- [ ] **Step 6: Eyeball it**

Run: `npm run dev` and look at http://localhost:5173: identity block bottom-left, three lines, no overlap with the NODES/LINK telemetry line above it, no collision with the chevrons. Then stop the dev server.

- [ ] **Step 7: Run suites and commit**

Run:
```bash
set -o pipefail
npx vitest run 2>&1 | tail -4
lsof -ti:4173 | xargs kill 2>/dev/null; npm run e2e 2>&1 | tail -4
```
Expected: all pass.

```bash
git add index.html src/styles.css src/nodes/registry.ts tests/registry.test.ts e2e/smoke.spec.ts
git commit -m "feat: identity block, LinkedIn headline, meta/OG tags, Person JSON-LD"
```

---

### Task 10: og:image capture

**Files:**
- Create: `scripts/capture-og.mjs`
- Create: `public/og.png` (generated)

- [ ] **Step 1: Write the capture script**

Create `scripts/capture-og.mjs`:

```js
// One-off: capture public/og.png (1200x630) from the local preview build.
// Usage: npm run build && npm run preview -- --port 4173 --strictPort &
//        node scripts/capture-og.mjs
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
// let the galaxy render and the pre-sheared arms settle visually
await page.waitForTimeout(4000)
await page.screenshot({ path: 'public/og.png' })
await browser.close()
console.log('wrote public/og.png')
```

- [ ] **Step 2: Build, serve, capture**

Run:
```bash
lsof -ti:4173 | xargs kill 2>/dev/null
npm run build && (npm run preview -- --port 4173 --strictPort &) && sleep 2
node scripts/capture-og.mjs
lsof -ti:4173 | xargs kill 2>/dev/null
```
Expected: `wrote public/og.png`.

- [ ] **Step 3: Inspect the image**

Open `public/og.png` (Read tool or `open public/og.png`). It must show the galaxy with the identity block legible bottom-left. If the galaxy is dim or half-loaded, bump the timeout to 6000 and recapture.

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-og.mjs public/og.png
git commit -m "feat: social card image and capture script"
```

---

### Task 11: First-visit hint (TDD)

**Files:**
- Create: `src/hud/hint.ts`
- Create: `tests/hint.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `e2e/smoke.spec.ts`

Pattern follows telemetry.ts: pure model exported for unit tests, DOM work inside the create function.

- [ ] **Step 1: Write the failing model tests**

Create `tests/hint.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HINT_DELAY_S, HINT_KEY, HintModel } from '../src/hud/hint'

function memStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
  }
}

describe('HintModel', () => {
  it('is pending at start and shows after the delay', () => {
    const h = new HintModel(memStorage())
    expect(h.state()).toBe('pending')
    h.tick(HINT_DELAY_S - 0.1)
    expect(h.state()).toBe('pending')
    h.tick(0.2)
    expect(h.state()).toBe('visible')
  })

  it('never shows when the flag is set', () => {
    const h = new HintModel(memStorage({ [HINT_KEY]: '1' }))
    h.tick(HINT_DELAY_S * 10)
    expect(h.state()).toBe('done')
  })

  it('interaction dismisses and persists the flag', () => {
    const storage = memStorage()
    const h = new HintModel(storage)
    h.tick(HINT_DELAY_S + 1)
    h.interact()
    expect(h.state()).toBe('done')
    expect(storage.getItem(HINT_KEY)).toBe('1')
  })

  it('interaction before the delay suppresses the hint entirely', () => {
    const h = new HintModel(memStorage())
    h.interact()
    h.tick(HINT_DELAY_S * 10)
    expect(h.state()).toBe('done')
  })

  it('survives a throwing storage (shows every visit instead)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const h = new HintModel(throwing)
    h.tick(HINT_DELAY_S + 1)
    expect(h.state()).toBe('visible')
    h.interact()
    expect(h.state()).toBe('done')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hint.test.ts 2>&1 | tail -5`
Expected: FAIL, cannot resolve `../src/hud/hint`.

- [ ] **Step 3: Implement the hint module**

Create `src/hud/hint.ts`:

```ts
// First-visit hint: an in-fiction directive typed beneath the focus
// reticle. Model is pure and unit-tested; DOM work stays in createHint.

export const HINT_DELAY_S = 2
export const HINT_KEY = 'handleyio:hint-seen'
export const HINT_LINES = [
  'MANUAL CONTROL AVAILABLE',
  'DRAG TO ROTATE SECTOR · BEACONS RESPOND TO CONTACT',
]

export type HintPhase = 'pending' | 'visible' | 'done'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class HintModel {
  private t = 0
  private phase: HintPhase

  constructor(private storage: StorageLike) {
    let seen = false
    try {
      seen = storage.getItem(HINT_KEY) === '1'
    } catch {
      // blocked storage: the hint shows every visit, which is acceptable
    }
    this.phase = seen ? 'done' : 'pending'
  }

  tick(dt: number): void {
    if (this.phase !== 'pending') return
    this.t += dt
    if (this.t >= HINT_DELAY_S) this.phase = 'visible'
  }

  interact(): void {
    if (this.phase === 'done') return
    this.phase = 'done'
    try {
      this.storage.setItem(HINT_KEY, '1')
    } catch {
      // best effort
    }
  }

  state(): HintPhase {
    return this.phase
  }
}

const TYPE_MS = 35
const FADE_MS = 300

export interface Hint {
  /** Call per frame. interacted: any qualifying user interaction this frame. */
  update(dt: number, interacted: boolean): void
}

export function createHint(
  root: HTMLElement,
  model: HintModel,
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
): Hint {
  const el = document.createElement('div')
  el.className = 'hud-hint'
  el.setAttribute('aria-hidden', 'true')
  const rows = HINT_LINES.map(() => {
    const r = document.createElement('div')
    el.append(r)
    return r
  })
  root.append(el)

  let shown: HintPhase = 'pending' // last phase reflected in the DOM

  function show() {
    el.classList.add('open')
    document.querySelector('.hud-reticle')?.classList.add('hint')
    if (reducedMotion) {
      HINT_LINES.forEach((line, i) => (rows[i].textContent = line))
      return
    }
    // typing runs on its own timer, never in the render loop
    let row = 0
    let chars = 0
    const timer = setInterval(() => {
      if (shown === 'done' || row >= HINT_LINES.length) {
        clearInterval(timer)
        return
      }
      chars++
      rows[row].textContent = HINT_LINES[row].slice(0, chars)
      if (chars >= HINT_LINES[row].length) {
        row++
        chars = 0
      }
    }, TYPE_MS)
  }

  function hide() {
    el.classList.remove('open')
    document.querySelector('.hud-reticle')?.classList.remove('hint')
    setTimeout(() => el.remove(), FADE_MS)
  }

  return {
    update(dt, interacted) {
      if (shown === 'done') return
      if (interacted) model.interact()
      else model.tick(dt)
      const phase = model.state()
      if (phase === shown) return
      if (phase === 'visible') show()
      if (phase === 'done' && shown === 'visible') hide()
      shown = phase
    },
  }
}
```

- [ ] **Step 4: Run model tests**

Run: `npx vitest run tests/hint.test.ts 2>&1 | tail -5`
Expected: PASS (5 tests).

- [ ] **Step 5: Style it**

Append to `src/styles.css` (after the `.hud-reticle` rules):

```css
/* First-visit hint, typed beneath the reticle */
.hud-hint {
  position: fixed; z-index: 4; left: 50%; top: calc(50% + 13vh);
  transform: translateX(-50%); text-align: center;
  pointer-events: none; user-select: none;
  font-size: 11px; letter-spacing: 2px; line-height: 2;
  color: var(--hud-accent); text-transform: uppercase;
  text-shadow: 0 0 12px rgba(140, 192, 255, 0.35);
  opacity: 0; transition: opacity 0.3s ease;
}
.hud-hint.open { opacity: 1; }
.hud-reticle.hint { border-color: rgba(140, 192, 255, 0.45); }
```

- [ ] **Step 6: Wire it in main.ts**

In `src/main.ts`, import and create the hint, then drive it from the frame loop:

```ts
import { createHint, HintModel } from './hud/hint'
import { safeStorage, withCache } from './data/source'
```
(merge with the existing `withCache` import line)

After the `createNodeNav(...)` call:

```ts
  const hint = createHint(document.getElementById('hud')!, new HintModel(safeStorage()))
```

Inside the `sceneCtx.onFrame` callback, after `interaction.update(dt)`:

```ts
    hint.update(dt, rig.userActive() || hud.openId() !== null)
```

(`rig.userActive()` covers drag and wheel; `hud.openId()` covers beacon tap, chevron arrival, and keyboard focus, all of which open a panel.)

- [ ] **Step 7: e2e-test the hint lifecycle**

Append to `e2e/smoke.spec.ts`:

```ts
test('first-visit hint shows once and never returns', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.hud-hint')).toHaveClass(/open/, { timeout: 5000 })
  await expect(page.locator('.hud-hint')).toContainText('MANUAL CONTROL', { timeout: 5000 })
  // a real drag dismisses it
  await page.mouse.move(600, 300)
  await page.mouse.down()
  await page.mouse.move(680, 300, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.hud-hint')).not.toBeAttached({ timeout: 2000 })
  // reload: flag set, hint stays away
  await page.reload()
  await page.waitForTimeout(3500)
  await expect(page.locator('.hud-hint')).not.toHaveClass(/open/)
})
```

Check the existing "no panel opens without user interaction" test still passes: the hint is not a panel, so it must not trip that guard (it asserts on `.hud-panel` only).

- [ ] **Step 8: Run suites and commit**

Run:
```bash
set -o pipefail
npm run build 2>&1 | tail -3 && npx vitest run 2>&1 | tail -4
lsof -ti:4173 | xargs kill 2>/dev/null; npm run e2e 2>&1 | tail -4
```
Expected: all pass.

```bash
git add src/hud/hint.ts tests/hint.test.ts src/main.ts src/styles.css e2e/smoke.spec.ts
git commit -m "feat: first-visit hint, telemetry directive at the reticle"
```

---

### Task 12: Mobile device projects and touch e2e

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/mobile.spec.ts`

- [ ] **Step 1: Add mobile projects**

Replace the `projects` array in `playwright.config.ts`:

```ts
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /mobile/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, testMatch: /mobile/ },
  ],
```

- [ ] **Step 2: Install webkit locally**

Run: `npx playwright install webkit`
Expected: webkit downloads (CI already installs it per Task 1).

- [ ] **Step 3: Write the mobile smoke tests**

Create `e2e/mobile.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }))
})

test('tapping a beacon opens its panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const pos = await page.evaluate(() =>
    (window as unknown as Record<string, (id: string) => { x: number; y: number }>)
      .__nodeScreen('github'),
  )
  await page.touchscreen.tap(pos.x, pos.y)
  await expect(page.locator('.hud-panel')).toHaveClass(/open/)
  await expect(page.locator('.hud-title')).toHaveText('GITHUB')
})

test('chevron navigation works by touch', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Next node' }).tap()
  await expect(page.locator('.hud-panel')).toHaveClass(/open/, { timeout: 8000 })
})

test('identity block and links are present on a small viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#wordmark .id-name')).toBeVisible()
  // every node reachable: chevron through all five
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Next node' }).tap()
    await expect(page.locator('.hud-panel')).toHaveClass(/open/, { timeout: 8000 })
  }
})
```

Note: `getByRole('button', { name: 'Next node' })` matches the chevron's existing accessible name (used by the desktop chevron test). If the tap-on-beacon test fails because the panel's open-action is what gets hit, re-fetch coordinates just before tapping.

- [ ] **Step 4: Run the mobile projects**

Run: `lsof -ti:4173 | xargs kill 2>/dev/null; set -o pipefail; npx playwright test --project=mobile-chromium --project=mobile-webkit 2>&1 | tail -5`
Expected: 6 passed (3 tests x 2 devices). Failures here are audit findings, not test bugs: keep the test, file the finding (Task 13), fix, re-run.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/mobile.spec.ts
git commit -m "test: mobile device projects and touch smoke tests"
```

---

### Task 13: Mobile audit

**Files:**
- Create: `docs/superpowers/audits/2026-06-11-mobile-audit.md` (findings record)
- Modify: whatever the findings demand (each fix is its own commit)

This is discovery work: the checklist is fixed, the fixes are not. Every finding gets a Linear issue (project handley.io, milestone "v1.3 refinements") with a problem statement; fixes follow the normal TDD loop where testable.

- [ ] **Step 1: Capture the audit evidence**

Run, with the preview server up (`npm run build && npm run preview -- --port 4173 --strictPort &`):

```bash
mkdir -p /tmp/mobile-audit
for device in "Pixel 7" "iPhone 13"; do
  for orient in portrait landscape; do
    npx playwright screenshot --device="$device" $([ $orient = landscape ] && echo "--viewport-size=851,393") \
      --wait-for-timeout=5000 "http://localhost:4173" \
      "/tmp/mobile-audit/$(echo $device | tr ' ' '-')-$orient.png"
  done
done
```

(If `playwright screenshot` flags differ in the installed version, write a five-line capture script with `chromium.launch` + device descriptors instead; the deliverable is four screenshots.)

- [ ] **Step 2: Review each screenshot against the checklist**

Read each image and judge:
- Identity block: legible? clipped? colliding with chevrons or telemetry?
- Telemetry corners: crowding the small viewport? (`max-width: 640px` already hides tr/br; is what remains right?)
- Panels: would a panel near the screen edge clamp on-screen? (open one via the touch e2e, screenshot again)
- Beacon tap targets: hit-sphere screen size at mobile distance vs the ~44px guideline
- Hint: legible at mobile width? two lines wrapping badly?
- Quality tier: `pickInitialCount` result for 390x844 (check `src/quality.ts` thresholds, log it via the console in a screenshot run)

- [ ] **Step 3: Record findings and file issues**

Write `docs/superpowers/audits/2026-06-11-mobile-audit.md`: one section per finding (problem, evidence screenshot, severity), plus a "clean" list for checklist items that passed. File each finding as a Linear issue under milestone "v1.3 refinements".

- [ ] **Step 4: Fix the findings**

One commit per finding, message referencing the issue. CSS/layout fixes verify by re-running the Step 1 captures; interaction fixes get a test first (unit or mobile e2e) per TDD.

- [ ] **Step 5: Bradley's real-device pass**

Push is not live yet, so: `npm run dev -- --host` and have Bradley open the LAN URL on his phone (or defer to post-deploy and re-check). He judges gesture conflicts, heat, jank. His findings join Step 3's list and get fixed the same way. Label anything waiting on him `needs-bradley`.

- [ ] **Step 6: Commit the audit record**

```bash
git add docs/superpowers/audits/2026-06-11-mobile-audit.md
git commit -m "docs: mobile audit findings and resolutions"
```

---

### Task 14: Ship

**Files:**
- Modify: `docs/superpowers/specs/2026-06-11-v13-refinements-design.md` (deviations)
- Modify: `docs/superpowers/plans/2026-06-10-galaxy-homepage.md` (only if shared modules changed in ways that doc mirrors)

- [ ] **Step 1: Record spec deviations**

In the spec's "Deviations accepted during the build" section, record at minimum:
- `step()` mutates state in place instead of returning a new state (zero-allocation render loop rule).
- Focus-zone dwell no longer holds unrelated lingering panels open (v1 quirk normalized, see Task 5's quirk test).
- `pin()`/`clear()`/keyboard apply next frame instead of synchronously.
- Anything else the build surfaced.

- [ ] **Step 2: Full local verification**

Run:
```bash
set -o pipefail
npm run build 2>&1 | tail -3
npx vitest run 2>&1 | tail -4
lsof -ti:4173 | xargs kill 2>/dev/null; npm run e2e 2>&1 | tail -4
```
Expected: everything green. Do not push with anything red.

- [ ] **Step 3: Commit docs, push, watch the deploy**

```bash
git add docs/
git commit -m "docs: v1.3 spec deviations and plan sync"
git push
gh run watch --repo bshandley/handleyio
```
Expected: test, build, e2e, deploy-pages all green. The first run on the bumped actions is itself the BRA-55 verification.

- [ ] **Step 4: Production spot-check**

Headless Playwright against https://handley.io (viewport 2200x1000): load idle 3s → no panel; identity block text present; hint appears by 3s on a fresh context; `curl -sI https://handley.io/og.png | head -1` → HTTP 200.

- [ ] **Step 5: Linear close-out**

Close BRA-54 and BRA-55 with root-cause notes. Update the chunk issues for this milestone. Anything found-but-deferred becomes a triage issue. (Build log and milestone close wait for Bradley's real-device pass if Step 13.5 was deferred.)
