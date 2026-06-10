import type { Vector3 } from 'three'
import type { CameraRig } from '../camera/controls'

// Chevron navigation: fly the camera to the next node around the core.
// Ending centered on the node lets focus mode open its panel for free.

const TAU = Math.PI * 2
const CENTERED_EPS = 0.15

/**
 * Next camera azimuth that centers a node, moving in `dir` around the core.
 * Skips angles within eps of the current azimuth (already centered).
 */
export function nextAzimuth(
  current: number,
  angles: number[],
  dir: 1 | -1,
  eps = CENTERED_EPS,
): number {
  let best = Infinity
  for (const a of angles) {
    const d = ((((dir === 1 ? a - current : current - a) % TAU) + TAU) % TAU)
    if (d > eps && d < best) best = d
  }
  return best === Infinity ? current : current + dir * best
}

export interface NodeNav {
  go(dir: 1 | -1): void
}

export function createNodeNav(
  root: HTMLElement,
  rig: CameraRig,
  nodePositions: () => Vector3[],
): NodeNav {
  function go(dir: 1 | -1) {
    // three's azimuth convention: atan2(x, z) around Y
    const angles = nodePositions().map((p) => Math.atan2(p.x, p.z))
    const target = nextAzimuth(rig.controls.getAzimuthalAngle(), angles, dir)
    rig.flyToAzimuth(target)
  }

  const nav = document.createElement('div')
  nav.className = 'hud-nodenav'
  for (const [dir, glyph, label] of [
    [-1, '‹', 'Previous node'],
    [1, '›', 'Next node'],
  ] as const) {
    const b = document.createElement('button')
    b.className = 'hud-nodenav-btn'
    b.textContent = glyph
    b.setAttribute('aria-label', label)
    b.addEventListener('click', () => go(dir))
    nav.append(b)
  }
  root.append(nav)

  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'ArrowRight') go(1)
  })

  return { go }
}
