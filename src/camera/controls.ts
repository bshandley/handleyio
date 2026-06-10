import type { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const IDLE_RESUME_MS = 5000
const DRIFT_SPEED = 0.25
const RAMP_RATE = 1.5 // exponential approach toward the target speed, per second

export interface CameraRig {
  controls: OrbitControls
  update(dt: number): void
}

export function createControls(
  camera: PerspectiveCamera,
  dom: HTMLElement,
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
): CameraRig {
  const controls = new OrbitControls(camera, dom)
  controls.enableDamping = true
  controls.dampingFactor = 0.04
  controls.rotateSpeed = 0.6
  controls.enablePan = false
  controls.minDistance = 4
  controls.maxDistance = 18
  // autoRotate stays on permanently (OrbitControls ignores it mid-drag);
  // drift is shaped by ramping autoRotateSpeed below, so it never snaps.
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0

  let drifting = !reducedMotion
  // Positive autoRotateSpeed decreases azimuth, so drift continuing the
  // camera's last observed direction needs the opposite sign of dAzimuth.
  let driftDir = -1
  let speed = 0
  let prevAz = controls.getAzimuthalAngle()

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  controls.addEventListener('start', () => {
    drifting = false
    clearTimeout(idleTimer)
  })
  controls.addEventListener('end', () => {
    if (reducedMotion) return
    idleTimer = setTimeout(() => {
      drifting = true
    }, IDLE_RESUME_MS)
  })

  return {
    controls,
    update(dt) {
      const az = controls.getAzimuthalAngle()
      const dAz = az - prevAz
      prevAz = az
      // Track the camera's latest motion direction (drag or decaying momentum)
      // so resumed drift continues it instead of reversing.
      if (Math.abs(dAz) > 1e-5) driftDir = dAz > 0 ? -1 : 1

      const target = drifting ? DRIFT_SPEED * driftDir : 0
      speed += (target - speed) * Math.min(1, dt * RAMP_RATE)
      controls.autoRotateSpeed = speed
      controls.update(dt)
    },
  }
}
