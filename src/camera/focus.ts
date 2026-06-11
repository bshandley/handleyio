import { Vector3, type Camera } from 'three'

const v = new Vector3()

export interface FocusCandidate {
  id: string
  position: Vector3
}

export interface FocusGate {
  /** Record an explicit dismissal of whatever node is currently focused. */
  dismiss(focusedId: string | null): void
  /** May the focused node auto-open? Clears suppression once focus moves off it. */
  allow(focusedId: string | null, userActive: boolean): boolean
}

// Focus-open is for nodes the user rotates to center: idle drift and page
// load must never pop a panel (BRA-62). A beacon can also dwell near center
// for tens of seconds, so a dismissal must hold until that node leaves
// focus, not for a fixed time (BRA-61).
export function createFocusGate(): FocusGate {
  let suppressedId: string | null = null
  return {
    dismiss(focusedId) {
      suppressedId = focusedId
    },
    allow(focusedId, userActive) {
      if (focusedId !== suppressedId) suppressedId = null
      return userActive && focusedId !== null && suppressedId === null
    },
  }
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
