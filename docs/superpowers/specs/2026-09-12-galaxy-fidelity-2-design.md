# Galaxy fidelity round two: density-wave orbits, light model, close range, dust, beacons

Date: 2026-09-12
Status: approved 2026-09-12
Linear: milestone to be created at approval if the Linear MCP is
authenticated in the build session; otherwise the plan's checkboxes track
progress as in round one.
Previous round: docs/superpowers/specs/2026-09-10-galaxy-fidelity-design.md

## Why

Round one gave the galaxy its layers (glow, dust, HDR chain, quality
ladder). Captured at the top quality level on 2026-09-12, the build still
falls short of the photographic target in ways that are structural rather
than tuning:

1. The inner disc inside r of about 2 is concentric rings at load, not
   arms. Arms are material and the sim starts pre-wound at 160 s, so the
   differential curve has already sheared the inner disc into rings, and
   the dust follows it into brown rings. Round one recorded this as the
   density-wave follow-up.
2. Every resolved star renders at the same brightness. Only size varies,
   so the disc reads as evenly spread salt with no depth. Photographs span
   orders of magnitude in stellar brightness; faint stars sink into haze and
   bright ones stand out in front of it.
3. Outer arms are grey, not blue. AgX desaturates anything approaching its
   shoulder, and additive haze approaches it everywhere. This was left open
   in round one.
4. The bulge is a flat cream disc with a hard edge. A real bulge is a steep
   peak with long tails and light spilling into the inner disc. Bloom at
   strength 0.3 is barely visible.
5. The closest zoom is a white sheet. Min distance 4 sits inside a 4.5
   radius disc and the camera may reach the plane, where the additive
   layers saturate to grey and individual glow sprites show as blobs. The
   dust also fades to nothing there by design, which is exactly where a
   real galaxy shows its strongest lane.
6. Dust lanes are a smooth brown fringe rather than filaments and knots.
7. Beacons are five identical flat cyan discs that read as UI markers on
   top of the galaxy rather than objects in it.
8. Deep-field smudges are large and bright enough at 1600 px to read as
   rice grains; the 2500-star background is sparse at that width.
9. The first-visit hint types directly over the core.

Bradley asked for the full list in one round.

## Success criteria

- Judged by eye (Bradley, desktop and phone, plus level-0 headless
  captures during the build): two arms that hold their shape for the whole
  session with no ring-up in the inner disc; resolved stars spanning faint
  to bright with a few blooming giants; blue outer arms and a gold-to-white
  core with no hue skew; a peaked bulge whose light spills into the inner
  disc; a closest zoom that still reads as a galaxy with colour and lanes;
  filamentary dust; beacons that look like bright stars in the disc;
  background that reads as texture rather than dots.
- Desktop stays at 60 fps at the top level; phone at 30 fps or better at its
  initial level. Governor order unchanged: bloom, then layer density, then
  stars.
- Zero per-frame allocations in the render loop, as before.
- No change to the panel state machine, focus, node data contract, HUD
  telemetry, data sources, or fallback HTML. The camera gains a polar clamp
  and a larger min distance (a deliberate interaction change, see below);
  the hint moves; beacons gain designation tags. Existing vitest and
  Playwright suites stay green, updated where a test pins a value this spec
  changes.
- Devices without float render targets still get every change except tone
  mapping, bloom, and the grain (which lives in the finish pass).

## Approaches considered for the arms

A. Epicyclic density wave (chosen). Every orbiting instance moves on a
tilted ellipse whose tilt advances with semi-major axis. Ellipses crowd
along a two-armed spiral that is fixed in a frame rotating at one pattern
speed, while individual stars stream through it at their own orbital
speed. The pattern never winds. This is the classic tilted-ellipse galaxy
model and it fits the existing architecture: one shared orbit chunk, all
layers on the same curve, no per-frame CPU work.

B. Periodic re-seeding of the material arms: fade stars back toward the
ridge when they drift past a threshold. Visible churn, and it is a patch
on a model that is wrong.

C. Frozen pattern with rigid rotation: turn differential rotation off and
spin the whole disc. No winding, but no streaming either; it reads as a
photograph on a turntable, and the beacons' orbital motion becomes a
rotation of the map.

## Architecture

Render order per frame, unchanged from round one:

    background starfield + deep field          additive
    glow (unresolved light + bulge)            additive
    far-side resolved stars                    additive
    dust                                       multiply (custom blend)
    near-side resolved stars                   additive
    beacons                                    additive

Post chain unchanged in shape: RenderPass, UnrealBloomPass, OutputPass,
FinishPass. The tone mapper and bloom radius are retuned (below). The
finish pass gains animated grain.

### Orbit model (the shared chunk)

Per-instance attributes replace `aRadius`/`aAngle`:

- `aA`: semi-major axis (the guiding radius; every radial law in the
  generators keeps producing this value where it produced `radius`).
- `aPhase`: orbital phase at t = 0.
- `aY`: height, as before.
- `aEcc`: eccentricity. 0 for bulge instances (circular), a radial law for
  disc instances, small random for field stars.

Uniforms: `uTime`, `uOrbit` (0 freezes, as today), `uSpin` (tilt advance
per world unit of a), `uWobble` (sinusoidal tilt perturbation amplitude),
`uPattern` (pattern angular speed, radians per second).

    tilt(a)  = uSpin * a + uWobble * sin(a * 3.1) + uPattern * uTime
    omega(a) = 0.0875 / (0.3 + a)                  (the round-one curve)
    phi      = aPhase + omega(a) * uTime * uOrbit
    local    = (a * cos(phi), a * (1 - aEcc) * sin(phi))
    world.xz = rotate(local, tilt(a))
    world.y  = aY

The pattern speed is a small fraction of omega at mid radius so the arms
visibly turn over a session (target: one pattern turn in roughly 8 to 10
minutes) while stars inside the corotation radius overtake the arms and
stars outside fall behind, which is the streaming the eye should see.

Ridge definition: the arms lie along the line of apsides, so arm k's
ridge angle at radius a is `tilt(a) + k * PI`. `ArmModel.ridgeAngle` keeps
that meaning and becomes the CPU mirror of the GLSL tilt (minus the
pattern term, which is time). `ArmModel.sample` is retired: disc stars are
no longer scattered about the ridge; their phase is uniform and the arms
emerge from crowding. Arm contrast is controlled by eccentricity and spin,
not by placement.

Eccentricity law, tunable: `e(t) = eInner * (1 - eFalloff * t)` with
t = a / radius, so the inner disc is more elliptical (stronger crowding)
and the outer edge stays round. Starting values eInner 0.35, eFalloff 0.5.

Armness: the vertex shader computes how close an instance currently is to
the ridge:

    psi     = atan(world.z, world.x)
    armness = pow(0.5 + 0.5 * cos(2.0 * (psi - tilt(a))), uArmPower)

This is stationary in the pattern frame, so it is a time-stable signal.
Three layers use it: stars brighten and shift blue with armness (young
population born in the arm, fading as it drifts out), glow alpha scales
with armness (haze concentrates in the arms), dust alpha scales with
armness computed against the dust's own offset tilt. This replaces the
"clump" blue shift as the mechanism for young blue arms; the clusters
themselves stay (see stars).

Spurs: the round-one spur model scattered samples off the ridge, which
the new placement no longer does. Spurs are retired in this round; the
wobble term and the armness power give the arms enough irregularity, and
the tangent-aligned dust (below) supplies the feathering. Recorded as a
deliberate simplification.

CPU mirror: new `src/galaxy/orbit.ts`, pure TypeScript, exports
`ORBIT` (spin, wobble, pattern, eInner, eFalloff, and the omega
constants), `tilt(a, t)`, `omega(a)`, `orbitPosition(elements, t)`, and
`solveElements(x, z, ecc, t)` (the inverse: given a world position at
time t, find a and phase by fixed-point iteration on the tilt, which
converges in a few steps because the tilt varies slowly with a).
`orbitalSpeed()` in generate.ts moves here. The GLSL chunk inlines the
same constants; a unit test compares the TypeScript positions against a
hand-evaluated GLSL transcription for a handful of elements so the two
cannot drift apart silently.

Sim start: elapsed starts at 0. The 160 s pre-wind existed only to shear
material arms; the density wave needs no warm-up. Telemetry's SIM-T
therefore starts at +0000S.

### Stars (`generate.ts`, `shaders.ts`, `galaxy.ts`)

- Placement: bulge as today (two-component now, see bulge); disc stars
  draw a from the round-one radial law, phase uniform, eccentricity from
  the law above. Field stars: a uniform in area, small random e. Clusters:
  each cluster is an element set (a, phase, y); members share the
  cluster's a exactly and jitter phase and y, so a cluster stays compact
  forever (same a means same omega) instead of shearing.
- Luminosity: new attribute `aLum`. `lum = lumFloor + lumScale * (size /
  sizeMax)^2`, giants multiplied by a giant boost so they exceed 1.0 in
  the HDR target and bloom. Colour stays chromaticity in [0, 1] (the
  generation tests keep their bounds); brightness is `aLum` times the
  intensity uniform. `STAR_INTENSITY` is retuned because most stars become
  dim.
- Twinkle: giants only. `lum *= 1 + twinkleAmp * sin(uTime * f + hash)`
  with f and hash derived from the instance's phase attribute (no new
  attribute). Under prefers-reduced-motion `uTime` is frozen so twinkle
  stops with everything else.
- Armness boost: `lum *= 1 + uArmLum * armness` and colour shifts toward
  blue by `uArmBlue * armness` in the vertex shader; disc stars only
  (bulge instances have e = 0 and armness is masked by a bulge flag folded
  into `aEcc`: e = 0 means no armness).
- Spikes and the far/near split are unchanged.

### Glow and bulge (`glow.ts`)

- Disc instances: same radial law, uniform phase, eccentricity law, and
  alpha scaled by `1 - uGlowArm + uGlowArm * armness` so the haze is
  brighter in the arms without vanishing between them.
- Bulge: two components, core (sigma about 0.3 of bulgeRadius, share
  about 0.35, brighter) and halo (sigma about 2.5 of bulgeRadius, the
  rest), both e = 0. The steep peak comes from the core component, the
  spill from the halo plus a larger bloom radius. Star generation gets the
  same two-component bulge so resolved bulge stars follow the glow.
- Proximity attenuation: uniform `uProximity` set per frame from the
  camera's distance to the origin; glow alpha scales by a smoothstep
  between two distances (starting values: full at 7, 0.45 at 5.5). One
  scalar uniform write per frame.

### Dust (`dust.ts`, `noise.ts`, `billboard.ts`)

- Placement: lane instances draw a from the round-one law and a uniform
  phase; their tilt is offset by `-laneTilt` radians (a uniform on the dust
  material, replacing the world-unit `laneOffset`) so their crowding sits
  on the concave side of the star ridge. Armness for dust uses the offset
  tilt. Disc population as today.
- Atlas: 8 cells at 256 px (4 round as today, 4 elongated at about 2.5:1
  by anisotropic noise sampling and an elliptical edge). Cell index in
  `aShape` as today.
- Tangent alignment: the billboard chunk gains `uAlign`. When 1, the quad
  rotation is the screen-space angle of the orbit tangent (derivative of
  the ellipse position with respect to phase, transformed to view space)
  plus `aRotation` as jitter. Elongated cells therefore lie along the
  lane. Glow and deep field leave `uAlign` at 0.
- Opacity: per-instance alpha from a skewed distribution (most instances
  thin, a few dense) instead of uniform 0.5 to 1.0.
- Dark clumps: about 15% of instances are small (0.08 to 0.16 world
  units), dense, and placed on the star ridge itself (tilt offset 0), the
  knots that sit inside arms in photographs.
- `dustFade` stays as a safety net for the plane crossing, but with the
  polar clamp below it never engages in normal use.

### Camera (`controls.ts`)

- Round one's limits stand: any polar angle (the galaxy can be viewed from
  underneath) and `minDistance` 4. The round-two clamp (12 degrees off the
  plane, `minDistance` 5.5) was rejected by eye after shipping as too
  limiting and too small; see the rework deviation below. The dust plane
  fade (`dustFade`) covers the edge-on crossing as in round one.
- Everything else (drift, breathing, fly-to, gesture gating) unchanged.

### Tone mapping (`post.ts`)

The first build task is a spike: capture level 0 with AgX and with three's
Neutral tone mapping at two or three exposures, same scene and camera.
Decision criterion: outer arms hold their blue past t of about 0.6 and the
core rolls gold to white without a hue skew or a clipped plateau. If
Neutral passes, it ships and the four palette stops are retuned against it.
If Neutral clips the core, AgX stays and the glow and star intensities are
lowered so the arms sit below the desaturating shoulder. The decision and
the captures' file names go in the plan's constants table. Bloom radius
starts at 0.6 (from 0.3), strength retuned, threshold stays 1.0.

### Beacons (`beacons.ts`)

- One instanced billboard mesh for all nodes (one draw call, from five
  sprites), rendered at `RENDER_ORDER.beacons` as today. The fragment
  draws a spiked star core in the HUD accent colour at intensity above 1.0
  so bloom lifts it, plus a thin ring whose radius pulses from `uTime`
  with a per-instance phase. The canvas halo texture and SpriteMaterial
  go.
- Orbits: the mesh uses the shared orbit chunk with the node's elements as
  instance attributes, so the GPU places beacons with no per-frame upload.
  The CPU keeps the hit spheres and `worldPosition()` on the same curve via
  `orbit.ts`. Registry positions remain world positions at t = 0;
  `solveElements` converts them at init.
- Hit radius, pick, focus, panel, nav: unchanged.

### Background (`starfield.ts`, `deepfield.ts`)

- Starfield count 2500 to 7000, size law skewed smaller (most stars under
  a pixel), `STARFIELD_INTENSITY` retuned so the total light is similar.
  Bright spiked foreground stars stay at 24.
- Deep field count 40 to 120, size 0.25 to 0.7 (from 0.4 to 1.2), alpha
  0.06 to 0.18 (from 0.15 to 0.35).

### Finish pass (`post.ts`)

Animated grain on top of the existing dither: `uTime` and `uGrain`
uniforms; a hash of fragment coordinate and time gives noise in [-0.5,
0.5], scaled by `uGrain / 255` and by `(1 - luma)` so it lives in the
shadows. Under prefers-reduced-motion the time uniform is held at 0 (static
grain). Chromatic aberration was considered and rejected: it reads as a
filter on this kind of image.

### HUD (`styles.css`, `hint.ts`, new `hud/tags.ts`, `registry.ts`)

- Hint: moves from the core to the lower third, centred above the chevrons
  on desktop and above the wordmark on phones. CSS only; the model and
  typewriter are untouched.
- Beacon tags: a small persistent designation next to each beacon (the
  sector-map framing). `GalaxyNode` gains an optional `tag` (e.g. `GH-01`);
  when absent the tag is derived from the designation's first token. One
  div per node, positioned each frame through the existing projector,
  written only when the rounded position changes; hidden when the node's
  panel is open, when the beacon is off screen, and at phone widths (the
  chevrons and wordmark already fill the bottom on phones). 9 px mono,
  dim colour, 1.5 px letter spacing, offset up and right of the beacon.
  Pointer events none.

### Quality ladder (`quality.ts`)

Ladder shape unchanged. Cost deltas: starfield and deep field are cheap
point/instance counts; beacons drop from five draws to one; grain is a
few ALU ops in a pass that already runs. No new rung.

## Performance and compatibility

- Per-frame additions: two scalar uniform writes (proximity, finish time)
  and the beacon pulse reads `uTime` already set. No allocations.
- Vertex cost rises slightly (ellipse, tilt, armness, optional tangent per
  instance). The dominant cost remains fill rate, which the polar clamp
  and min distance reduce.
- No new dependencies. Neutral tone mapping ships in three 0.184.
- Direct (no-HDR) path: everything except tone mapping, bloom, grain.

## Testing

Vitest (pure modules, injected rng):

- orbit: `orbitPosition` matches a TypeScript transcription of the GLSL
  chunk for sample elements; `solveElements` round-trips positions to
  within 1e-4; tilt advances by spin per unit a; omega equals the
  round-one curve.
- arms: ridgeAngle equals tilt plus k pi; wobble zero gives a pure spiral.
- generate: existing bounds hold; `aLum` within [lumFloor, giant max];
  giants exceed 1.0; bulge two-component shares within tolerance; cluster
  members share a; colours stay in [0, 1]; y-sort and split unchanged.
- glow, dust: buffer sizes match counts; dust a stays above the bulge and
  below the soft edge; clump fraction and sizes within range; atlas cell
  indices in [0, 8); elongated cells have the expected aspect in the
  rendered mask.
- noise: elongated cell renderer is deterministic and anisotropic.
- beacons: elements solved from registry positions reproduce those
  positions at t = 0; `worldPosition` after `update(t)` matches
  `orbitPosition`.
- starfield, deepfield: counts, size and alpha ranges.
- post: `hdrSupported` unchanged; finish shader uniforms include time and
  grain.
- controls: polar and distance constants exported and asserted (pure
  values).
- tags: derivation of the tag from a designation; visibility rules as a
  pure function of (panel open, on screen, width).
- registry: optional `tag` field validated.

Playwright:

- Existing suite unchanged in intent. Assertions that pin the sim start
  or beacon sprite count are updated.
- New: a drag toward edge-on leaves the camera elevation at or above 12
  degrees (read from the telemetry INC line); beacon tags are present on
  desktop and absent at phone width.

By eye (Bradley): the success criteria, plus a check at +10 minutes that
the arm structure is unchanged from load.

## Ship

Push to main per repo CLAUDE.md. Recapture `public/og.png` with
`scripts/capture-og.mjs` after tuning. Mirror every tuned constant into
the plan's constants table.

## Out of scope

- Volumetric gas and dust.
- Chromatic aberration, lens flare, anamorphic streaks.
- Spiral structure in deep-field galaxies.
- Audio, auto-tour, analytics, new data sources.
- The headless context loss seen at level 0 in SwiftShader during the
  2026-09-12 capture (first four seconds, then recovered). Triage note; not
  reproduced on hardware.

## Deviations accepted during the build

- Tone mapping decision (Task 1 spike): Neutral ships, `AgXToneMapping`
  stays selectable through the `?tone=` dev pin. Outer arms hold their
  blue under Neutral and grey out under AgX; the core rolls gold to pale
  rather than plateauing to a flat, desaturated white. Captures:
  `agx-085.png`, `neutral-085.png`, `agx-110.png`, `neutral-110.png`
  (`?tone=agx|neutral&exposure=0.85|1.1`). `?tone=` and `?exposure=` are
  dev aids only, parsed once at scene construction, not user-facing.
- `solveElements` (Task 2): the spec called for plain fixed-point
  iteration. Instrumented tracing on one registry position showed the
  plain loop converging only linearly, with successive errors shrinking
  by a factor of roughly 0.89 per step, needing on the order of 90
  iterations to reach the round-trip tolerance rather than the dozen or
  so assumed. Shipped a guarded Steffensen/Aitken-accelerated iteration
  instead: 8 cycles of two plain fixed-point steps each, combined by
  Aitken extrapolation, 17 fixed-point evaluations total (8 cycles of
  two plain fixed-point steps each, plus the final consistency
  evaluation; the same evaluation budget as the plain loop the brief
  specified), with a guard
  that falls back to the plain next iterate when the extrapolation would
  be degenerate or overshoot. Converges to about 1e-14 for every real
  call site.
- Attribute names kept their round-one spelling with a new meaning:
  `aRadius`/`aAngle` on the star and billboard buffers now carry the
  ellipse semi-major axis `a` and orbital phase, not a polar radius and
  angle. Renaming them would have touched every buffer, shader, and test
  in the galaxy/glow/dust modules for no behavioural gain.
  `orbitPosition(aRadius, aAngle, aY, aEcc, aTilt)` reads the same
  arguments as elements plus a per-instance tilt offset.
- `ArmModel.sample`, `.laneAngle`, and the spur system are retired: the
  disc, glow, and dust populations now sample a uniform phase directly
  (`rand() * 2 * Math.PI`) and let the shared orbit chunk's eccentricity
  and tilt crowd them into arms, instead of the round-one procedural
  sampling. `ArmModel` is reduced to `{ params, ridgeAngle }`, used only
  to seed cluster and dust-lane phases at t = 0.
- Dust lane tilt moved from a shared material uniform to a per-instance
  `aTilt` billboard attribute, so lane and non-lane dust instances (and,
  later, any other tilt offset) can share one draw call instead of one
  per tilt value.
- `beaconFragment`'s ring term originally computed
  `pow((len - ringR) * 40.0, 2.0)`, undefined in GLSL ES for a negative
  base inside the ring radius. Replaced with `float dr = (len - ringR) *
  40.0; exp(-dr * dr) * (...)`, mathematically identical for all signs of
  `dr` (found and fixed during Task 7's review).
- `e2e/smoke.spec.ts`, `'telemetry draw count covers the whole frame on
  the hdr path'` (Task 7): beacons collapsing from five per-node sprites
  to one instanced mesh drops the floor-scene draw count from 7 to 5
  (background 1, deep field 1, two star halves 2, one beacon mesh 1); the
  composer's output and finish passes bring the full-frame count back to
  7. Assertion changed from `toBeGreaterThan(7)` to
  `toBeGreaterThanOrEqual(7)`, with the comment deriving the number.
- `e2e/mobile.spec.ts`, `'tapping a beacon opens its panel'` (Task 11):
  sim time now starts at 0, and on the Pixel 7 portrait viewport at load
  the github beacon projects off screen (x = 505 on a 412px-wide
  viewport) while other beacons are on screen. The test now evaluates
  every node's projected position, picks whichever is on screen and
  nearest the viewport centre, and taps that one instead of a fixed node
  id.
- `generateGlow`/`generateDust`'s `model` parameter, unused since the
  spur system was retired, is named `_model` to satisfy
  `noUnusedParameters`; position and type are kept for later reuse.
- Task 12 tuning: the round's headline goal (two arms with no ring-up)
  needed `ORBIT.eInner` raised from 0.35 to 0.55 and `ORBIT.spin` from
  0.95 to 1.7; at the starting values the tilt only advanced about 0.6
  turn across the disc, which crowded into a bar/ellipse rather than a
  wound spiral. `ARM_LUM` (0.8 to 1.3) and `GLOW_ARM` (0.7 to 0.85) then
  sharpened the arm/inter-arm brightness contrast on top of the real
  density crowding.
- Task 12 tuning: the bulge halo (yellow blobs floating above and around
  the disc) was a scale problem, not a bug. `bulgeHaloSigma` shrank from
  2.5 to 1.4 in both `GALAXY_DEFAULTS` and `GLOW_DEFAULTS`, and the glow
  bulge's hardcoded y-flatten factor in `generateGlow`
  (`src/galaxy/glow.ts`) dropped from `* 0.6` to `* 0.35` (the star bulge
  reuses `bulgeFlatten`, already a named param; the glow bulge's flatten
  was inline and is called out here since it is not in the constants
  table).
- Task 12 tuning: star-forming clusters read as flat white blobs because
  their phase jitter was too tight and their members too bright under
  additive blending. Cluster phase jitter (`generate.ts`) widened from
  `gauss() * 0.06` to `gauss() * 0.16`. A new `CLUSTER_LUM_FACTOR = 0.6`
  dims non-giant cluster members so a cluster reads as a sparkle of stars
  rather than one bright smear; giants inside a cluster keep full
  brightness. This constant is not in the spec's table; it lives next to
  `BRIGHT_GIANT_CUTOFF` in `generate.ts`.
- Task 12 tuning: dust lanes were invisible at the round's starting
  values, not because of a bug. Forcing `DUST_ABSORB` to 1.0 and
  `alphaFloor` to 0.6 confirmed the layer draws, in the correct place
  (concave side of the arm ridge, no `laneTilt` sign flip needed).
  Shipped values split the difference: `DUST_ABSORB` 0.65 to 0.85,
  `alphaFloor` 0.15 to 0.28.
- `scripts/capture-look.mjs` gained a `top` pose (drags the camera up over
  the disc to judge the spiral from overhead) and an optional fourth
  `waitSeconds` argument (waits that long, sim time included, before the
  pose and screenshot) for the ten-minute stability check, since a real
  browser wait was cheaper here than threading a `?simt=` dev pin through
  scene construction.
- Whole-branch review (Critical): the shipped `minPolarAngle` 12 degrees
  and `maxPolarAngle` 168 degrees forbade the two caps but still allowed
  90 degrees, edge-on in the plane, the exact view the clamp exists to
  prevent; OrbitControls measures the polar angle from +Y, not from the
  plane. Fixed to a single hemisphere: `minPolarAngle` 0, `maxPolarAngle`
  78 degrees (`MAX_POLAR_DEG`), so the camera never goes below the plane
  and stays at least 12 degrees off it, with the top-down view allowed.
- Whole-branch review (Important): dust atlas rows were sampled inverted
  during tuning. `buildDustAtlas`'s `CanvasTexture` defaults to `flipY =
  true`, so canvas row 0 (the round clump cells) sampled at v in [0.5, 1]
  while the fragment maps cells 0-3 to v in [0, 0.5]; round and elongated
  rows were swapped, so clumps rendered elongated and clouds rendered
  round. Fixed with `texture.flipY = false`; clump look re-checked
  before merge.
- Whole-branch review (Important): Task 12's tuning raised star
  intensity, luminosity, and armness about tenfold over round one,
  judged only against the HDR path's tone-mapped output. The direct
  (no-HDR) path renders straight to the screen buffer with no tone
  mapper, so giants and the core clipped flat to white. Added
  `Galaxy.setIntensity`/`GlowLayer.setIntensity`, and `DIRECT_PATH_SCALE
  = 0.4` in `src/render/post.ts`, applied to `galaxy`/`glow` only when
  `post.path === 'direct'`. Verified with
  `scripts/capture-look.mjs`'s new `direct` flag: `final-direct-load.png`
  shows individual bulge stars with no flat white disc.
- Post-merge hotfix (2026-09-12): the camera-clamp e2e test timed out on
  CI's software GL (30 to 40 mouse steps plus fixed sleeps) and skipped the
  deploy. Rewritten with six steps per drag, `expect.poll` on the INC
  telemetry, and `test.slow()`. Two latent defects fixed at the same time:
  the downward-drag assertion was tautological (INC >= 0) and now asserts
  INC near 0, and the upward drag started at y = 800 on a 720 px viewport,
  off canvas, so OrbitControls never saw it; it now starts inside the
  viewport and asserts the 78 degree clamp is reached.
- Rework after the 2026-09-12 revert: the merged build rendered a black
  scene at level 0 on real GPUs (Apple Metal, all three desktop browsers)
  while every headless capture had looked fine. Cause: `pow(w, uArmPower)`
  in the GLSL `orbitArmness`; `w = 0.5 + 0.5 cos(...)` rounds a hair below
  zero on Metal, `pow` returns NaN, and the bloom blur spreads NaN across
  the frame (rungs without bloom only lose single stars). Fix:
  `pow(max(w, 0.0), uArmPower)`. SwiftShader clamps this case, so real-GPU
  captures (Chromium new headless keeps Metal acceleration) are now part of
  the by-eye check at levels 0, 3, and 4 plus phone emulation.
- Rework, camera: `MIN_DISTANCE` back to 4 and no polar clamp (Bradley:
  the smaller view and the loss of the under-plane view felt too limiting).
  `MAX_POLAR_DEG` removed; the e2e test now asserts the camera can orbit
  below the plane.
- Rework, phone rungs: the haze and lanes collapsed at half glow and dust
  fractions because the tuning concentrated both into the arms. `GLOW_ARM`
  0.85 to 0.55, `GLOW_DEFAULTS.alpha` 0.048 to 0.07, `DUST_ARM` 0.6 to 0.3,
  `alphaFloor` 0.28 to 0.45, and ladder levels 2 to 4 draw 0.75 of the glow
  and dust instead of 0.5. The dust opacity test now measures "skewed thin"
  against the floor-to-one range rather than an absolute 0.5.
