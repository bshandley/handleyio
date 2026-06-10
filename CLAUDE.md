# handley.io

Landing page for handley.io: a swirling WebGL particle galaxy with beacon-star
link nodes (GitHub, email, LinkedIn), frosted-glass HUD panels, and live
GitHub commit data. Vite + vanilla TypeScript + Three.js, no framework.

## Bindings

- Linear project: `handley.io` (team Bradley, prefix BRA). Milestone
  "Galaxy homepage v1" shipped 2026-06-10.
- GitHub: https://github.com/bshandley/handleyio (public). GitHub Pages
  serves `main` via .github/workflows/deploy.yml (build_type: workflow,
  custom domain handley.io).
- Spec: docs/superpowers/specs/2026-06-10-galaxy-homepage-design.md
  (deviations recorded at the bottom).
- Plan: docs/superpowers/plans/2026-06-10-galaxy-homepage.md (kept in sync
  with the code; mirror any code change into the matching plan block).

## Commands

- Dev: `npm run dev`
- Unit tests: `npm test` (Vitest, tests/ only)
- E2E: `npm run e2e` (Playwright, Chromium + Firefox; first run needs
  `npx playwright install chromium firefox`)
- Typecheck + build: `npm run build`

## Ship steps

Push to `main` deploys automatically (Actions: test, build, deploy-pages).
No version bump or changelog in this repo. Verify the run with
`gh run watch --repo bshandley/handleyio`, then spot-check https://handley.io.

## Architecture notes

- `src/nodes/registry.ts` is the extensibility seam for new link nodes;
  `src/data/source.ts` for new live data sources (withCache wrapper,
  localStorage TTL). Galaxy/HUD code never special-cases nodes.
- The no-WebGL fallback is static HTML in index.html, hidden only after a
  successful init. Never remove those links.
- The render loop allows zero per-frame allocations; keep it that way.
