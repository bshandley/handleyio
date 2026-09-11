# Galaxy visual fidelity: layered rendering and HDR

Date: 2026-09-10
Status: approved
Linear: none this round (Bradley's call at approval; the plan's own
checkboxes track progress)

## Why

The galaxy reads as a scatter of dots with a clipped white core. The target
look is a photographic spiral: gold bulge rolling off to white, continuous
glowing arms with blue star clusters sparkling on top, brown filamentary dust
lanes, a background of temperature-colored stars and faint distant galaxies.

Four causes, in order of weight:

1. Additive points accumulate into an 8-bit framebuffer, so everything past
   1.0 clips to flat white. No HDR target, no tone mapping.
2. Nothing draws unresolved light. Real arms are mostly smooth glow from
   stars too faint to resolve; we draw only the resolved ones.
3. Additive blending can only add light. Dust lanes need something that
   subtracts it. The current "dust" (a 30% dim on 8% of stars) only thins
   the field.
4. Palette and arm shape. A lavender mid-disc, four symmetric arms, a
   single-color 1.2px background starfield.

Approach chosen: layered particles (B of three considered). A: post-
processing only, fixes the core but leaves grainy arms and no dust. C:
ray-marched volumetric gas, best up close and worst on phones. B keeps every
layer on the same orbital curve so they wind together, works from every
camera angle including edge-on, and fits the repo's rules (few draw calls,
zero per-frame allocations).

## Success criteria

- Judged by eye against the reference on Bradley's desktop and phone: gold
  core without a hard white plateau, continuous arms, visible brown dust
  lanes, stars of several colors in the background.
- Desktop stays at 60fps at the top quality level; phone at 30fps+ at its
  initial level. The governor steps effects down before stars.
- No change to interaction, HUD, focus, or node behavior. The existing
  vitest and Playwright suites stay green (updated only where a test pins
  a value this spec changes).
- Devices without float render targets still get the palette, arms, glow,
  and dust; they lose tone mapping and bloom.

## Architecture

Render order per frame, all in one scene, one camera:

    background starfield + distant galaxies      additive
    glow layer (unresolved light + bulge)        additive
    far-side resolved stars                      additive
    dust layer                                   multiply
    near-side resolved stars                     additive
    beacons                                      additive

"Far" and "near" are the two sides of the galactic plane relative to the
camera: stars are sorted by y at generation time into two draw ranges, and
their renderOrder swaps when the camera's y crosses the plane. Dust darkens
everything behind it (background, glow, far stars) and leaves near-side
stars and beacons untouched, so bright clusters still sit on top of lanes
as they do in photographs. The glow layer is drawn entirely behind the dust
by design: lanes read strongest against smooth light, which is where the
eye expects them.

Post chain, when float render targets are available:

    RenderPass (half-float target)
    UnrealBloomPass (half resolution, luminance threshold above 1.0)
    OutputPass (AgX tone mapping, exposure uniform)
    FinishPass (vignette + screen-space dither (interleaved gradient
      noise), sRGB space, renders to screen)

Without float targets the scene renders directly to the canvas as today.
Three 0.184 ships EffectComposer, RenderPass, UnrealBloomPass, and
OutputPass; EffectComposer already defaults its target to HalfFloatType.
No new dependencies. Tone mapping choice: AgX over ACESFilmic because ACES
skews saturated blues toward purple and bright warms toward orange; AgX
desaturates highlights without the hue shift, which is exactly the gold-to-
white core we want. Exposure is a single tunable.

## Modules

New:

- `src/galaxy/arms.ts`: the arm model, shared by every layer. Given a
  radius, returns the arm ridge angles and a density weight; samples
  positions on or near an arm with a gaussian spread, optional spur
  branching, and the same rotation curve `orbitalSpeed()`. Pure,
  deterministic under an injected rng. Parameters: arm count (2, the
  reference is a grand-design two-arm spiral), spin, spur count and
  strength, spread.
- `src/galaxy/billboard.ts`: instanced billboard geometry builder and the
  shared vertex shader chunk: orbit placement (same math as the star vertex
  shader), camera-facing quad, per-instance size, rotation, and atlas cell,
  a screen-space size cap, and a fade to zero within a short distance of
  the camera. One draw call per layer, no gl_PointSize involvement (point
  size is hardware-capped on some mobile GPUs and cannot sample a rotated
  atlas cell, which is what makes dust filamentary).
- `src/galaxy/glow.ts`: the unresolved-light layer. A few thousand large,
  dim, soft instances following the arm density, plus a warm ellipsoidal
  bulge population that carries the gold core at controlled intensity.
  Gaussian profile computed in the fragment shader, no texture.
- `src/galaxy/dust.ts`: the dust layer. Instances placed along the inner
  (trailing) edge of each arm and thinly across the mid-radius disc; none
  in the bulge (real bulges are dust-poor) and few past the nominal radius.
  Each instance samples one cell of a 4-cell procedural cloud atlas
  (value-noise fbm rendered to a CanvasTexture at init, no image assets,
  same mechanism as the beacon halo). Multiply blending with a
  wavelength-dependent transmission (blue absorbed most, red least), so
  lanes come out brown, not black. Absorption strength is a uniform.
- `src/galaxy/deepfield.ts`: distant galaxies. A few dozen small instanced
  smudges on the far sphere: elliptical gaussian with a brighter core,
  random tilt and aspect, faint warm or cool tint.
- `src/render/post.ts`: HDR capability probe (`EXT_color_buffer_float` or
  `EXT_color_buffer_half_float` on the renderer), composer construction,
  the FinishPass shader, `render()`, `setSize()`, `setBloom(on)`, and
  `dispose()`. The probe decision is a pure function of extension flags so
  it is unit-testable.

Changed:

- `src/galaxy/generate.ts`: uses `arms.ts` for placement; adds a dense
  old-gold bulge population instead of packing arm stars at the center;
  palette becomes gold core, warm white, blue-white, blue edge (the
  lavender mid stop goes); keeps the temperature axis, clump blue shift,
  power-law sizes, fuzzy edge, and the existing buffer contract. The 30%
  "dust" dim on random stars is removed (dust is now a real layer). Output
  additionally sorted by y with the split index returned, so `galaxy.ts`
  can build two draw ranges.
- `src/galaxy/shaders.ts`: star fragment gets a two-part profile (tight
  core plus a faint wide halo) and 4-point diffraction spikes on stars
  above the bright-giant cutoff, signalled by a varying from the vertex
  shader, which also enlarges those points so the spikes fit. The orbit
  math moves into a shared GLSL chunk string used by the star vertex shader
  and `billboard.ts`.
- `src/galaxy/galaxy.ts`: two Points objects sharing one set of attribute
  buffers (two BufferGeometry, each with its own drawRange), a
  `setCameraSide(abovePlane: boolean)` that assigns renderOrder (number
  assignments only, no allocation), and `rebuild()` preserving the split.
- `src/galaxy/starfield.ts`: custom ShaderMaterial replacing
  PointsMaterial: per-star color on a temperature distribution (mostly
  white and blue-white, a minority orange), power-law sizes, and a handful
  of bright foreground stars with spikes via the shared star profile chunk.
  Returns a Group containing the starfield and the deep field.
- `src/scene.ts`: adds the layers to the scene, flips the star split per
  frame from the camera's y sign, resets `renderer.info` manually once per
  frame (`autoReset = false`) so the telemetry DRAW count covers the whole
  frame instead of the last post pass, renders through `post.ts` or
  directly, and forwards resize to the composer. Beacon group renderOrder
  is set above the dust layer.
- `src/quality.ts`: the tier list becomes an ordered quality ladder. Each
  level: star count, glow fraction, dust fraction, bloom on/off, pixel-
  ratio cap. Stepping down first drops bloom, then halves glow and dust
  (instanceCount, no rebuild), then steps stars down as today. Phones
  start with bloom off. `FpsGovernor.update()` keeps its contract
  (returns the next level or null) with the level type widened.
- `src/main.ts`: applies a quality level (star rebuild, instance counts,
  bloom toggle, pixel ratio) through one `applyLevel()` instead of a
  particle count.
- `src/nodes/registry.ts`: beacon positions are data; they may be re-placed
  by eye once the two-arm structure is settled so beacons sit on arms
  rather than in lanes. No code change.

Unchanged and unaffected: camera, focus, interaction, panel state machine,
HUD, hint, telemetry (it reads the same fields), data sources, fallback
HTML.

## Layer details

Stars: 15k to 60k as today. The bulge takes a fixed fraction of the count,
placed in an ellipsoid (flattened in y) with a gold palette and an old-
population size distribution (few giants). Arm stars carry the clumps and
the young blue shift. Colors stay chromaticity in [0, 1]; scene brightness
is a shader uniform so the generation tests keep their bounds.

Glow: instance count on the order of 2,000 to 4,000 at the top level; world
size 0.3 to 1.0 units; opacity low enough that arms read as haze, not fog.
Color follows the same radial palette as the stars. Bulge glow sprites are
warmer and denser toward the center; the tone mapper's shoulder, not
clipping, produces the pale center.

Dust: instance count on the order of 1,500 to 3,000; world size 0.2 to 0.6;
placed with the arm model's spread offset toward the inner edge of the
ridge; a low-density disc population between the bulge radius and the
nominal radius. Because instances orbit on the differential curve, they
shear into filaments over sim time, which is the look we want at load
(sim starts at 160s as today).

Background: the starfield count and far-sphere placement stay; sizes
follow a power law from sub-pixel to a few pixels, with a handful of large
spiked foreground stars. Deep field: 30 to 60 smudges, 1 to 3 pixels of
core, fainter than the faintest galaxy arm so they never compete.

Bloom: half resolution, threshold at or above 1.0 in the HDR target so
only the core, bright giants, blue clusters, and beacons bloom; strength
and radius tuned by eye. Off by default on phones (heat and fill rate;
the mobile audit flagged both).

Finish: a mild vignette and a screen-space dither (interleaved gradient
noise) of half an LSB so the smooth glow gradients do not band in 8-bit
output.

All numeric values above are starting points; final values are tuned by
eye during the build and recorded in the plan.

## Performance and compatibility

- Fill rate is the main cost: the camera can approach to distance 4 inside
  a 4.5-radius disc, where large sprites cover the screen. The billboard
  chunk caps screen size and fades sprites within roughly one unit of the
  camera; both are uniforms.
- Draw calls: background 1, deep field 1, glow 1, stars 2, dust 1, beacons
  5, plus post passes. The telemetry DRAW count reports the real total.
- Zero per-frame allocations remains a hard rule. The per-frame work added
  is: one sign test, renderOrder assignments, an info reset, and the
  composer's fixed pass list.
- Half-float render targets need `EXT_color_buffer_float` (WebGL2). Where
  absent, `post.ts` reports no HDR and the scene renders directly: same
  layers, no tone mapping, no bloom. CI's software-GL Firefox exercises
  whichever path mesa provides; an e2e test forces the direct path by
  stubbing `getExtension` and asserts frames still render.
- Pixel ratio: still capped at 2; the quality ladder can lower the cap on
  phones when post is on.
- prefers-reduced-motion: unchanged. Layers freeze with the stars.
- Memory: about 20MB for the composer's two half-float targets at 1.3M
  pixels; bloom's targets are allocated but never bound while disabled.

## Testing

Vitest (pure modules, injected rng):

- arms: deterministic; ridge angle advances with radius by spin; sampled
  positions cluster around ridges within the configured spread; spur
  samples stay within the disc.
- generate: existing tests hold; bulge fraction lands within tolerance;
  output is sorted by y and the split index matches the sign change; no
  color leaves [0, 1].
- glow and dust generation: buffer sizes match counts; dust radius stays
  above the bulge radius and below the soft edge; atlas cell indices are
  in range.
- quality: ladder is strictly decreasing in cost; step-down order is bloom,
  then fractions, then stars; phone heuristic never starts with bloom;
  governor contract tests updated to the level type.
- post: HDR probe returns false when both extensions are absent and true
  when either is present.
- galaxy split: the pure renderOrder assignment function gives far-before-
  dust-before-near for both camera sides.

Playwright:

- Existing suite unchanged in intent; the frame-count and click tests run
  against the new pipeline.
- New: forced no-HDR path renders frames and hides the fallback.
- Render path is exposed as a test-only hook (`window.__renderPath`,
  'hdr' or 'direct', alongside `__frameCount`). Draw-count sanity: on
  the 'hdr' path the telemetry DRAW line exceeds the pre-change 7,
  confirming the composer reset fix; on 'direct' the assertion is
  skipped, since CI's software GL decides which path runs.

By eye (Bradley, desktop and phone): the success criteria above, plus a
check at +10 minutes of sim time that the arm structure still reads (see
out of scope).

## Ship

Push to main per repo CLAUDE.md. Recapture `public/og.png` with
`scripts/capture-og.mjs` after the look is final, since the social card is
a screenshot of the old renderer.

## Out of scope

- Volumetric (ray-marched) gas and dust.
- The winding problem: arms are material, not a density wave, so
  differential rotation shears them toward rings over a long session
  (roughly ten relative turns in the inner disc after ten minutes). The
  layered look will make this more visible. If the +10 minute check shows
  the structure is gone, the follow-up is epicyclic (tilted-ellipse) orbits
  in the shared orbit chunk, which keep a stable spiral pattern while stars
  flow through it. Triage issue at approval.
- Audio, auto-tour, analytics, new data sources, BRA-53.

## Deviations accepted during the build

- Starfield and deep field are two modules added to the scene separately;
  the spec's "returns a Group containing both" was dropped as needless.
- Dust uses `CustomBlending` (`ZeroFactor`, `SrcColorFactor`) rather than
  three's `MultiplyBlending`, which in 0.184 requires premultiplied alpha
  and folds alpha into the result.
- The beacon halo CanvasTexture is tagged `SRGBColorSpace` and its gradient
  stops were steepened (`src/nodes/beacons.ts`): the HDR OutputPass
  double-encoded the untagged texture and flattened the halos into discs.
- `?level=N` pins a quality level and bypasses the governor
  (`parseLevelParam` in `src/quality.ts`); a tuning and screenshot aid, not
  a user-facing setting.
- `GLOW_DEFAULTS.bulgeAlphaScale` gives bulge glow instances their own
  alpha; the spec's single glow alpha could not keep the core below AgX's
  shoulder.
- Glow instance count is 5000 at the top level (spec said 2000 to 4000);
  11000 halved the frame rate on CI's software GL and timed out the hint
  e2e test, so haze density is bought with sprite size, not count.
- Glow sprite size (`sizeMin`/`sizeMax`) ended at 0.12 to 0.36 world units,
  shifted down from the spec's 0.3 to 1.0 starting range: at 1.0 units a
  single sprite covered about 106px on a 1600x900 frame, reading as a
  discrete grey puff rather than haze. Dust count, dust size, and bloom
  threshold stayed inside their spec ranges; deep field count (40) was
  never tuned.
- Spikes: `BRIGHT_GIANT_CUTOFF` moved to the value in the table so only a
  few dozen disc stars carry diffraction spikes (the spec's "top few
  percent" read as a Christmas tree).
- Winding check: after roughly 280 s of additional sim time (SIM-T
  +0439s, headless capture wind-600.png) the inner disc inside r of about 2
  reads as concentric rings while the outer arms still read as two arms.
  Shipped as-is; the density-wave orbit follow-up remains the fix.
- `scripts/capture-og.mjs` now pins `?level=0` and stubs the GitHub API.
  The first-visit hint did not appear in the capture window, so no
  hint-seen flag was needed.
- Dust absorption fades to zero within about ten degrees of an edge-on
  camera (`dustFade` in dust.ts); the far/near star swap at the plane
  crossing otherwise flashed the darkened half from top to bottom (found by
  Bradley on real hardware).
- The first-visit hint's 2 s delay is now clocked from performance.now() in
  main.ts instead of the frame-capped dt; the heavier scene lowered CI's
  software-GL frame rate enough that the capped clock stretched the delay
  past the e2e test's window.
