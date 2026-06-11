# handley.io galaxy homepage: design

Date: 2026-06-10
Status: approved pending final review

## Purpose

A single-page landing site for handley.io. A swirling, three-dimensional
particle galaxy fills the viewport. Link nodes (GitHub, email, LinkedIn) are
embedded in the galaxy as beacon stars; activating one materializes a sci-fi
info panel with actions and, where available, live data. Visually beautiful
first, contact page second. Must be extensible: new nodes and new live data
layers get added later without reworking the core.

## Decisions made during brainstorming

- Art direction: hybrid. Realistic particle galaxy, holographic HUD elements
  that appear only on engagement (option C of three mocked up).
- Panel style: frosted glass slab, scales/fades in with gentle overshoot
  (option B of two mocked up).
- Hosting: GitHub Pages, deployed by GitHub Action on push to main.
- Live data: yes, starting with GitHub commit activity, fetched client-side
  from the public GitHub API, no auth, no server. Details of future data
  layers deferred to a separate brainstorm.
- Mobile: tap to inspect.
- Identity: small monospace "handley.io" wordmark, bottom-left, always
  visible. No other static text.

## Stack

Vite, vanilla TypeScript, Three.js. No UI framework, no router, no state
library. Tests: Vitest (unit) and Playwright (smoke, Chromium + Firefox).

Rationale: Three.js Points + custom shaders gives a GPU-driven galaxy at
30-60k particles with one draw call; OrbitControls with damping provides the
momentum camera for free; raycasting provides picking. Hand-rolled WebGL was
rejected as maintenance-heavy for a landing page; Canvas 2D pseudo-3D was
rejected as the main path (kept as the no-WebGL fallback aesthetic).

## Module layout

- `galaxy/`: particle system, swirl shader, decorative background starfield.
- `camera/`: OrbitControls config (damping, zoom limits, idle auto-drift),
  focus detection (which node is nearest screen center).
- `nodes/`: node registry. A node is a data object: id, label, 3D position,
  panel content, optional data source id. Adding a node is adding one entry.
- `hud/`: DOM overlay. Info panels, wordmark, 3D-to-screen projection,
  leader lines from node to panel.
- `data/`: data source interface and the GitHub commits fetcher.
- `fallback/`: no-WebGL path.

The node registry and the data source interface are the two extensibility
seams. Galaxy and HUD code never special-case individual nodes.

## Scene and visuals

- Spiral galaxy, 3-4 arms, 30-60k particles (adaptive, see Performance).
  Warm bright core grading to cool blue-violet arm tips, with dust-dark
  patches. Additive blending for glow; no postprocessing bloom in v1 (may be
  added later behind a quality flag).
- Differential rotation computed in the vertex shader: orbital speed falls
  off with radius, so the galaxy visibly swirls. CPU does no per-particle
  work after init.
- Background: a few thousand static stars on a far sphere for parallax depth.
- Link nodes render as larger, brighter beacon stars with a faint pulsing
  halo so they read as interactive.
- Idle behavior: slow camera auto-drift after a few seconds of no input.
- Wordmark: "handley.io", monospace HUD style, bottom-left.

## Camera and interaction

- Drag / touch-drag orbits around the galactic core. OrbitControls damping
  gives glide-to-a-stop momentum. Scroll / pinch zooms within min/max limits.
- Node activation, three equivalent triggers, one shared panel component:
  1. Focus: rotating a node to within a small radius of screen center fades
     its panel in; leaving fades it out.
  2. Hover (desktop): raycast against enlarged hit spheres, immediate.
  3. Tap (mobile): tap node opens panel; tap panel action follows link; tap
     empty space dismisses.
- One panel open at a time. When a panel opens, the camera eases slightly
  toward the node, returning control instantly on any input.
- Keyboard: Tab cycles nodes (hidden focusable elements), Enter follows,
  Escape closes.

## Nodes and panels (v1 content)

Panel chrome: frosted glass slab (blur, soft border, glow shadow), node
designation line for flavor (e.g. "NODE 01 · GH-SECTOR"), leader line to the
beacon star.

- GitHub: username/link, 30-day push sparkline and count, last-push time,
  Open button. (The unauthenticated public events API exposes pushes, not
  per-push commit counts.)
- Email (hello@handley.io): address, Copy action, Compose (mailto) action.
- LinkedIn (https://www.linkedin.com/in/bshandley/): name and headline,
  Open button.

GitHub username: bshandley. The LinkedIn headline text is a configuration
value in the node registry, supplied at implementation.
Desktop click on a beacon star behaves like mobile tap (opens the panel).

## Live data layer

- Interface: a data source exposes `fetch(): Promise<NodeData>` and a cache
  TTL. The HUD renders panels immediately with static content and fills live
  fields when the fetch resolves. A slow or failed source never blocks
  anything.
- GitHub source: public REST API, `/users/<user>/events/public`,
  client-side, unauthenticated. Derives 30-day push count, sparkline
  buckets, last-push time. Cached in localStorage, TTL 1 hour. Keeps usage
  far under the 60 req/hour unauthenticated limit.
- On fetch failure (rate limit, offline): panel shows static content plus a
  small "live data unavailable" line in HUD style. No error dialogs.
- Future sources implement the same interface and attach to nodes via the
  registry.

## Performance and compatibility

Targets: 60fps mid-range desktop, 30fps+ mid-range phone. Chrome, Firefox,
Safari (desktop and iOS).

- Device pixel ratio capped at 2.
- Initial particle count from a startup heuristic (screen size,
  hardwareConcurrency). Auto-tune: sustained FPS below threshold steps the
  count down. No user-facing quality settings.
- One draw call for the galaxy, one for the background stars. No per-frame
  allocations in the render loop. HUD is DOM, zero per-frame GPU cost.
- Rendering pauses when the tab is hidden.
- prefers-reduced-motion: galaxy renders static (no swirl, no auto-drift)
  but still responds to drag.
- No WebGL: static CSS starfield with the three links as glass cards. The
  links are plain HTML present from first paint and progressively enhanced;
  a JS failure never removes them.

## Error handling

- WebGL context loss: HUD-styled reload prompt.
- Data fetch failure: per-panel graceful degradation (above).
- Any uncaught error in galaxy code leaves the static link fallback usable.

## Testing

- Vitest: data layer (API response parsing, cache expiry, failure paths),
  node registry.
- Playwright (Chromium + Firefox): page loads, canvas produces frames, each
  node panel opens via click and via keyboard, fallback path renders with
  WebGL disabled.
- Visual polish verified by eye, not pixel tests.

## Out of scope for v1

- Additional data layers beyond GitHub commits (separate brainstorm).
- Postprocessing bloom, audio, auto-tour mode.
- Analytics, SEO beyond a title/description/social meta tags pass.

## Deviations accepted during the v1 build

- No separate fallback/ module: the no-WebGL fallback is static HTML in
  index.html, hidden by JS only after successful init. Strictly more robust
  (works with JS disabled); intent preserved.
- "Camera eases slightly toward the node when a panel opens" is deferred to a
  follow-up issue (BRA: camera ease on panel open). All other interaction
  behavior shipped as specified.
- LinkedIn panel shows the name line only; the headline text is a config
  value still to be supplied.
- The Playwright suite covers keyboard activation of every panel and the
  no-WebGL path; a click-on-beacon e2e test is a follow-up.

## v1.1 polish round (2026-06-10, post-launch feedback)

Changes driven by first-eyes review of the live build:

- Galaxy realism: gaussian arm scatter, arm wobble, star-forming clumps
  (blue-white), field stars off the arms, blackbody-axis color variation,
  power-law sizes with rare white giants, fuzzy edge (soft cap 1.2x radius),
  stars dimmed 25%.
- Rotation: quartered (orbitalSpeed 0.0875/(0.3+r)); scene starts 160
  simulated seconds in so arms load pre-sheared.
- Beacons orbit with the galaxy on the same speed curve, sharing the
  scene's elapsed time (reduced motion freezes both).
- Hover panels: 350ms close grace plus pointer-over-panel hold.
- Idle camera: drift continues the camera's last motion direction with a
  speed ramp (no sudden reverse), plus a breathing zoom (180s cycle, max
  40% closer, pauses on interaction, re-bases on resume).
- Chevron node navigation (‹ › bottom-center, ArrowLeft/Right): flies the
  camera to the next node around the core, closes any open panel at flight
  start, pins the target's panel on arrival. Solves mobile travel between
  off-screen nodes.
- Ambient telemetry HUD: sector block (UTC, sim time), render stats (FPS,
  live star count, draw calls), camera bearing readout, node/link status,
  focus reticle sized to the activation threshold, corner brackets.
- GitHub metric is pushes, not commits (unauthenticated events API strips
  commit counts).

## v1.2 focus mode refinements (2026-06-11, BRA-61/BRA-62)

"Rotating a node to within a small radius of screen center" means the user
rotating. As shipped in v1, focus-open also fired during idle auto-drift
and at page load: with beacons orbiting, below-plane nodes (pliny, email)
transit the focus zone every few minutes and dwell there for tens of
seconds, and on viewports wider than ~1.9:1 pliny sits inside the zone at
load, so its panel opened unprompted on every visit.

- Focus auto-open now requires user-driven camera motion: a pointer/wheel
  gesture or the 5s window before idle drift resumes (rig.userActive).
  Idle drift and page load never open panels.
- An explicit dismissal (Escape, empty-space tap, chevron) suppresses
  focus-reopen for the dismissed node until it leaves the focus zone, not
  for a fixed 1s; the 1s timer remains for nodes sweeping center right
  after a chevron flight starts.
