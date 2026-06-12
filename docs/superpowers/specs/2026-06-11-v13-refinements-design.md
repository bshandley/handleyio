# v1.3 refinements: state machine, identity, discoverability, mobile

Date: 2026-06-11
Status: approved
Linear: milestone "v1.3 refinements" under project handley.io

## Why

Post-launch assessment after the BRA-61/62/63 focus-mode bug family. Four
agreed workstreams:

1. The panel-visibility logic in src/interaction.ts grew three production
   bugs from the same root: implicit state spread across five interacting
   flags and timers. Extract an explicit, unit-testable state machine.
2. The site says almost nothing about Bradley. Add identity content and a
   real meta/SEO pass.
3. Nothing tells a first-time visitor the scene is interactive. Add a
   one-time hint.
4. The mobile experience has never been audited. Audit it and fix what
   the audit finds.

Existing backlog folded in: BRA-54 (robustness polish, unblocked now that
the headline exists) and BRA-55 (test/CI follow-ups, with a hard deadline:
GitHub forces Node 24 on deprecated action versions 2026-06-16).

## Audience and success criteria

Audience is both recruiters/hiring managers and engineering peers. Success:

- A first-time visitor on any device learns name and role without
  interacting, and learns the scene is interactive within seconds.
- Every panel-visibility behavior is enforced by a unit test, not
  discovered in production.
- A phone visitor can reach every link and panel by touch.

## Workstream A: panel-visibility state machine

New module src/interaction/panelstate.ts. Pure: no imports from Three or
the DOM.

- State: discriminated union closed | hover(id) | pinned(id) | focus(id),
  with bookkeeping carried alongside: graceT (close-grace countdown),
  suppressT (post-dismiss sweep timer), dismissedId (held until that node
  leaves the focus zone).
- Inputs per frame: dt, hitId (raycast result or null), pointerOnCanvas,
  pointerOverPanel, focusId (node inside the center zone or null),
  userActive, plus discrete events queued since the previous frame:
  click(id), clickEmpty, escape, pin(id), clear.
- API: step(state, inputs) returns the next state. Selector
  visibleId(state) returns the panel that should be open, or null. The
  adapter diffs visibleId between frames and calls hud.open/hud.close on
  change. The reducer never touches the HUD.
- interaction.ts shrinks to an adapter: DOM listeners, raycasting,
  building the per-frame inputs, executing the diff.

Contract: the v1.2 focus-mode semantics recorded in
2026-06-10-galaxy-homepage-design.md are the contract, not the shipped
code. Preserved semantics: focus-open requires userActive; explicit
dismissal holds dismissedId until it exits the zone, plus the 1s sweep
timer; 0.35s hover-close grace; a pinned panel restores when a transient
hover ends. Where current behavior and spec disagree, or the spec is
silent, behavior is normalized and every delta is listed in this spec's
deviations section during the build.

Approach chosen over alternatives: a data-driven statechart (indirection
without insight at 4-5 states) and a test-harness-only option (catches
regressions but leaves the tangle).

## Workstream B: identity block and meta/SEO

Identity block, static HTML in index.html, replacing the #wordmark
content in the same bottom-left position with telemetry styling:

    HANDLEY.IO            (current dim caps)
    BRADLEY HANDLEY       (one step brighter, slightly larger)
    CLOUD SECURITY LEADER. AFTER HOURS TINKERER. PERPETUALLY TIRED.

The bio line is Bradley's own wording, locked. Static HTML means no-JS,
no-WebGL, and crawler visitors all get name and role. The fallback
section keeps its own links unchanged.

Placement chosen over alternatives: a core beacon bio node and a hybrid
(name at wordmark, story in a core node). Bradley picked the wordmark
block; the node registry stays purely outbound links.

Meta pass, all in index.html:

- title: "Bradley Handley · handley.io"
- meta description and og:description: "Bradley Handley. Cloud security
  leader. Builder of Pliny and Gatehouse."
- og:image: 1200x630 screenshot of the live galaxy, captured once by a
  Playwright script, committed as public/og.png. twitter:card:
  summary_large_image.
- JSON-LD Person: name, url, jobTitle "Cloud Security Leader", sameAs
  GitHub and LinkedIn profile URLs.

Registry: the LinkedIn node panel headline (the BRA-54 needs-bradley gap)
becomes "Cloud security leader". The playful line stays in the identity
block only.

## Workstream C: first-visit hint

New module src/hud/hint.ts.

- Trigger: T+2s after init, only if the user has not yet interacted and
  localStorage "handleyio:hint-seen" is absent.
- Form: the focus reticle brightens; a directive types on beneath it:
  line 1 "MANUAL CONTROL AVAILABLE", line 2 "DRAG TO ROTATE SECTOR ·
  BEACONS RESPOND TO CONTACT". Same copy on touch (drag and contact both
  read correctly there).
- Dismissal: the first qualifying interaction (pointer travel past the
  existing 6px threshold, wheel, beacon tap, chevron, or tab focus) fades
  it out over 0.3s and sets the flag. It never returns on that browser.
- Reduced motion: no typing animation; the text appears statically and
  still fades on dismissal.
- Robustness: storage access wrapped; if storage is blocked the hint
  simply shows on every visit. Typing runs on its own timer, not in the
  render loop (zero per-frame allocation rule). Element is
  pointer-events: none and aria-hidden (keyboard users already get the
  focusable node buttons).

Form chosen over alternatives: a plain lowercase caption above the
chevrons (clearest, but breaks the HUD voice) and an animated ghost-drag
nudge (most discoverable, most work, reduced-motion complications).

## Workstream D: mobile audit, fixes in-round

Method, two layers:

- Emulated: Playwright device profiles, iPhone-class 390x844 and
  Android-class 412x915, portrait and landscape, touch enabled, against a
  fixed checklist: identity block legibility and collision with chevrons
  at narrow widths; telemetry corner crowding; panel placement near
  screen edges; beacon tap-target size against the ~44px guideline; hint
  legibility; pinch/rotate behavior in OrbitControls; which tier
  pickInitialCount selects.
- Real device: Bradley spends five minutes on his phone judging what
  emulation cannot: gesture conflicts, heat, jank.

Every finding gets its own Linear issue with a problem statement and root
cause. Scope decision: all findings are fixed in this round, cosmetic
included, not triaged away. Blocking flows get pinned by new e2e tests on
mobile viewports: tap-a-beacon opens its panel, chevron navigation works,
every link reachable by touch.

## Folded-in backlog

- BRA-54: guard navigator.clipboard.writeText with failure feedback; move
  setItem out of the fetch try-block so a quota error cannot mark a
  successful fetch as unavailable; survive fully blocked storage without
  leaving the fallback overlay covering a working galaxy. The headline
  item is resolved by workstream B.
- BRA-55: run the Playwright suite in CI; replace the fixed 500ms wait in
  the frame-count test with expect.poll; add a click-on-beacon e2e test;
  bump actions/checkout, setup-node, upload-artifact off deprecated Node
  20 versions. Deadline 2026-06-16 for the bump; it lands first.

## Testing

- Reducer: table-driven vitest scenarios driving step() through simulated
  time. BRA-61 (dismiss then dwell), BRA-62 (load at wide aspect, idle
  drift), and BRA-63 (stationary press) each become a named regression
  scenario.
- Hint: unit tests with fake timers and fake storage: shows at 2s, never
  shows with flag set, dismisses on each qualifying interaction,
  reduced-motion path.
- Meta: an e2e assertion that title, description, og:image, and JSON-LD
  are present, so a refactor cannot silently drop them.
- Mobile: the e2e additions listed in workstream D, running in CI like
  the rest of the suite once BRA-55 lands.
- Existing 54 vitest + 14 playwright tests stay green throughout.

## Out of scope

BRA-53 (camera ease on panel open), new data sources, postprocessing
bloom, audio, auto-tour, analytics.

## Delivery

Spec committed, then "v1.3 refinements" milestone in Linear, chunk issues
at plan time, push-to-main deploys per repo CLAUDE.md, build log at
milestone close.

## Deviations accepted during the build

(Recorded here as they are found; state machine behavioral deltas land in
this section for review.)
