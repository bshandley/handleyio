import { Vector3, type Camera } from 'three'

const v = new Vector3()

export interface ScreenPos {
  x: number
  y: number
  visible: boolean
}

/** Writes the projected screen position into `out` (no allocation) and returns it. */
export function toScreenInto(
  pos: Vector3,
  camera: Camera,
  width: number,
  height: number,
  out: ScreenPos,
): ScreenPos {
  v.copy(pos).project(camera)
  out.x = (v.x * 0.5 + 0.5) * width
  out.y = (-v.y * 0.5 + 0.5) * height
  out.visible = v.z > -1 && v.z < 1
  return out
}

export function toScreen(pos: Vector3, camera: Camera, width: number, height: number): ScreenPos {
  return toScreenInto(pos, camera, width, height, { x: 0, y: 0, visible: false })
}
