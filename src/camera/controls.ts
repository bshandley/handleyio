import { Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const IDLE_RESUME_MS = 5000
const DRIFT_SPEED = 0.25
const RAMP_RATE = 1.5 // exponential approach toward the target speed, per second

// Idle breathing zoom: dolly in toward the core and back out, much slower
// than the rotation (one zoom cycle ~ 3/4 of a drift revolution).
const ZOOM_PERIOD_S = 180
const ZOOM_MARGIN = 0.5 // never dolly closer than minDistance + margin
const ZOOM_DEPTH = 0.4 // dip at most this fraction of the base distance

const scratchDir = new Vector3()

export interface CameraRig {
  controls: OrbitControls
  update(dt: number): void
  /** Ease the camera around the core to the given azimuth (snap if reduced motion). */
  flyToAzimuth(target: number): void
}

const FLY_RATE = 3 // exponential approach, per second
const FLY_DONE_RAD = 0.01
const Y_AXIS = new Vector3(0, 1, 0)

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
  let zoomPhase = 0
  let zoomBase = controls.getDistance()
  let flyTarget: number | null = null

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const armIdleResume = () => {
    if (reducedMotion) return
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      zoomBase = controls.getDistance()
      zoomPhase = 0
      drifting = true
    }, IDLE_RESUME_MS)
  }
  controls.addEventListener('start', () => {
    drifting = false
    flyTarget = null // user input always wins over a chevron flight
    clearTimeout(idleTimer)
  })
  controls.addEventListener('end', armIdleResume)

  const rotateBy = (step: number) => {
    scratchDir.copy(camera.position).sub(controls.target)
    scratchDir.applyAxisAngle(Y_AXIS, step)
    camera.position.copy(controls.target).add(scratchDir)
  }

  return {
    controls,
    flyToAzimuth(target) {
      drifting = false
      clearTimeout(idleTimer)
      if (reducedMotion) {
        rotateBy(target - controls.getAzimuthalAngle())
        prevAz = controls.getAzimuthalAngle()
        return
      }
      flyTarget = target
    },
    update(dt) {
      if (flyTarget !== null) {
        const az = controls.getAzimuthalAngle()
        // shortest signed difference into (-PI, PI]
        const delta = Math.atan2(Math.sin(flyTarget - az), Math.cos(flyTarget - az))
        if (Math.abs(delta) < FLY_DONE_RAD) {
          flyTarget = null
          armIdleResume()
        } else {
          rotateBy(delta * Math.min(1, dt * FLY_RATE))
        }
      }

      const az = controls.getAzimuthalAngle()
      const dAz = az - prevAz
      prevAz = az
      // Track the camera's latest motion direction (drag or decaying momentum)
      // so resumed drift continues it instead of reversing.
      if (Math.abs(dAz) > 1e-5) driftDir = dAz > 0 ? -1 : 1

      const target = drifting ? DRIFT_SPEED * driftDir : 0
      speed += (target - speed) * Math.min(1, dt * RAMP_RATE)
      controls.autoRotateSpeed = speed

      if (drifting) {
        zoomPhase += (dt * Math.PI * 2) / ZOOM_PERIOD_S
        const amp = Math.max(
          0,
          Math.min(zoomBase - controls.minDistance - ZOOM_MARGIN, zoomBase * ZOOM_DEPTH),
        )
        const dist = zoomBase - (amp * (1 - Math.cos(zoomPhase))) / 2
        scratchDir.copy(camera.position).sub(controls.target).normalize()
        camera.position.copy(controls.target).addScaledVector(scratchDir, dist)
      }

      controls.update(dt)
    },
  }
}
