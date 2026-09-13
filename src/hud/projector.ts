import { Vector3, type Camera } from 'three'

const v = new Vector3()

export interface ScreenPos {
  x: number
  y: number
  visible: boolean
}

export function toScreen(pos: Vector3, camera: Camera, width: number, height: number): ScreenPos {
  v.copy(pos).project(camera)
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    visible: v.z > -1 && v.z < 1,
  }
}
