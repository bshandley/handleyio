import { Vector3, type Camera } from 'three'

const v = new Vector3()

export interface FocusCandidate {
  id: string
  position: Vector3
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
