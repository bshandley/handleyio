import type { Vector3 } from 'three'
import type { CameraRig } from '../camera/controls'

// Chevron navigation: fly the camera to the next node around the core and
// pin its panel on arrival (azimuth alone cannot guarantee focus capture,
// since the camera rides above the galactic plane).

const TAU = Math.PI * 2
const CENTERED_EPS = 0.15

/**
 * Index of the node whose azimuth is nearest in `dir` around the core,
 * skipping angles within eps of the current azimuth (already centered).
 * Returns -1 when there is no candidate.
 */
export function nextNode(
  current: number,
  angles: number[],
  dir: 1 | -1,
  eps = CENTERED_EPS,
): number {
  let best = Infinity
  let bestIndex = -1
  for (let i = 0; i < angles.length; i++) {
    const d = ((((dir === 1 ? angles[i] - current : current - angles[i]) % TAU) + TAU) % TAU)
    if (d > eps && d < best) {
      best = d
      bestIndex = i
    }
  }
  return bestIndex
}

export interface NodeNav {
  go(dir: 1 | -1): void
}

export function createNodeNav(
  root: HTMLElement,
  rig: CameraRig,
  nodes: () => Array<{ id: string; position: Vector3 }>,
  pin: (id: string) => void,
): NodeNav {
  function go(dir: 1 | -1) {
    const list = nodes()
    // three's azimuth convention: atan2(x, z) around Y
    const angles = list.map((n) => Math.atan2(n.position.x, n.position.z))
    const i = nextNode(rig.controls.getAzimuthalAngle(), angles, dir)
    if (i === -1) return
    rig.flyToAzimuth(angles[i], () => pin(list[i].id))
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
