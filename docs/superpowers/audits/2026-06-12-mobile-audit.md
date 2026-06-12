# Mobile Audit: handley.io v1.3 refinements

Date: 2026-06-12
Scope: phone-width layout, interaction, and performance on the Galaxy homepage.
Real-device pass deferred to post-deploy (Bradley).

## Method

Automated screenshots via Playwright (Chromium) at the following viewports:

| Label | Viewport | DPR | Notes |
|---|---|---|---|
| Pixel 7 portrait | 393x851 | 2.625 | Primary phone target |
| iPhone 13 landscape | 844x390 | 3 | Short-height landscape |
| Generic desktop | 1280x800 | 1 | Baseline/regression check |
| Panel open | 393x851 | 2.625 | GitHub panel triggered via keyboard |

Screenshots saved to `/tmp/mobile-audit/`. Wait time 3.5-5.5s per page to clear
the typewriter animation on the first-visit hint.

---

## Finding: BRA-68 (shipped in commit 50f62fc)

**Problem.** On viewport widths under ~640px the wordmark block (`#wordmark`,
z-index 4) spanned the full viewport width over the bottom-center chevrons
(`#hud-nodenav`, z-index 3). The bio line wrapped to two lines, making the
wordmark tall enough to cover both chevron buttons. Because `#wordmark` had no
`pointer-events: none`, every tap on or near the chevrons was intercepted by the
wordmark, making node navigation unreachable by touch.

**Root cause.** Centered chevrons placed at `left: 50%; transform: translateX(-50%)`
sit directly under the wordmark. The wordmark's default `pointer-events` value
absorbed touch events before they reached the HUD layer.

**Fix.** In `src/styles.css`, inside `@media (max-width: 640px)`:
- `.hud-nodenav` moves to `right: 16px` (bottom-right thumb zone), gap tightened
  to 12px. 44px targets preserved.
- `#wordmark` capped to `max-width: calc(100vw - 148px)` so it wraps clear of
  the chevrons.
- `.hud-tele-bl` lifted to `bottom: 122px` to stay above the taller wordmark.
- `#wordmark` given `pointer-events: none` globally; only the bio line restores
  `pointer-events: auto` and `user-select: text`.

Mobile e2e: 6/6 passed after fix.

---

## Finding: BRA-69 (shipped in commit 962abd3)

**Problem.** The first-visit hint (`hud-hint`) at 11px font and 2px
letter-spacing with no max-width constraint wrapped into 5 ragged centered lines
directly over the bright galaxy core at 393px viewport width. The lines had
insufficient contrast against the core glow and the ragged wrap (4-5 lines)
was visually noisy and difficult to read. Landscape phones (short height) placed
the hint at `top: 50% + 13vh`, which is adequate in tall viewports but lands the
text on the galaxy band in short ones.

**Root cause.** The base `.hud-hint` rule was sized for desktop (where the hint
spans roughly the center third of the screen) and had no phone-width override.
At 393px the two hint lines spread across ~430px of content width, forcing
mid-word wraps at arbitrary column positions.

**Fix.** In `src/styles.css`:

```css
@media (max-width: 640px) {
  .hud-hint {
    font-size: 9px;
    letter-spacing: 1.5px;
    max-width: 80vw;
  }
}

@media (max-height: 500px) and (max-width: 896px) {
  .hud-hint {
    top: calc(50% + 8vh);
    font-size: 9px;
    letter-spacing: 1.5px;
    max-width: 80vw;
  }
}
```

Result: portrait renders a clean 3-line wrap ("MANUAL CONTROL AVAILABLE / DRAG
TO ROTATE SECTOR / BEACONS RESPOND TO CONTACT."); landscape renders a compact 2-line
version shifted slightly above the galaxy equator. Desktop is unchanged (both
queries are gated on width and height limits that desktop viewports do not meet).

Fixed screenshots captured at `/tmp/mobile-audit/pixel-7-hint-fixed.png` and
`/tmp/mobile-audit/landscape-hint-fixed.png`.

---

## Checklist: Beacon tap-target size

**Verdict: marginal, acceptable given passing e2e.**

The hit sphere has `HIT_RADIUS = 0.4` world units (`src/nodes/beacons.ts:16`).
Camera: `PerspectiveCamera(55deg fovY, aspect, 0.1, 200)` at position
`(0, 3.2, 7.5)` (`src/scene.ts:25-26`).

Nearest node (github at `[2.8, 0.25, 0.6]`): camera distance ~8.0 units.
Projected diameter on a 393px-wide viewport:

```
radius_ndc = HIT_RADIUS / (dist * tan(fovY/2))
           = 0.4 / (8.0 * tan(27.5 deg))
           = 0.4 / 4.16 ~= 0.096
diameter_px = 0.096 * 393 ~= 37.8 px
```

Farthest node (gatehouse at `[-3.2, 0.15, -0.8]`): camera distance ~9.4 units,
projected diameter ~32px. The 44px guideline is not met (targets are 32-38px).
However: (a) the e2e tap suite passes on both portrait and landscape, meaning the
raycaster successfully resolves taps to node intent; (b) the beacons orbit slowly
so the target is not moving erratically; (c) increasing `HIT_RADIUS` risks
overlapping adjacent nodes (github and pliny are ~3.5 units apart). No fix
warranted at this time. Flag for real-device validation.

---

## Checklist: Quality tier on Pixel 7

**Verdict: clean, tier is sensible.**

`pickInitialCount(width, height, cores)` in `src/quality.ts` receives CSS pixel
dimensions. On Pixel 7 (393x851): `pixels = 393 * 851 = 334,443`. The 700k
threshold is not met, so the function returns `TIERS[2] = 25,000` particles
regardless of core count. This is correct behavior: a mobile GPU should not
receive the 40k or 60k tiers. The `FpsGovernor` can step down further (to 15k)
if the device sustains under 28 FPS for 3 seconds, providing a second safety net.
No change needed.

---

## Checklist: Telemetry corners on mobile

**Verdict: clean.**

The `@media (max-width: 640px)` rule hides `.hud-tele-tr` and `.hud-tele-br`
(top-right FPS/STARS/DRAW block and bottom-right BRG/INC/RNG block). The
`pixel-7-portrait.png` screenshot confirms what remains: the top-left sector/UTC/
SIM-T block and the bottom-left NODES/LINK status line. Both are legible against
the dark star field and do not overlap any interactive element. The corner tick
marks (`.hud-corner`) on all four corners also remain; at 18px they are
decorative and unobtrusive. Layout is correct.

---

## Checklist: Panel near screen edges

**Verdict: clean.**

The `pixel-7-panel-open.png` screenshot shows the GitHub panel (230px wide,
`src/styles.css:.hud-panel`) clamped to the top of the viewport with a small
margin. The panel is fully on-screen, the "Open" action button is reachable, and
the panel does not overlap the chevrons or wordmark. The JS panel-placement code
uses `clamp` against `innerWidth`/`innerHeight` to keep panels in-bounds.
No overflow observed. Clean.

---

## Post-deploy

Bradley should do a real-device pass on a physical iPhone and Android device
after the next deploy to `main`. Key things to verify by touch:

1. Chevron tap response (right-thumb zone, bottom-right).
2. Beacon tap accuracy (32-38px projected targets).
3. Hint legibility in direct sunlight (low ambient contrast).
4. Panel "Open" button reachability with one hand in portrait.
