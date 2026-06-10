import type { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const IDLE_RESUME_MS = 5000

export function createControls(
  camera: PerspectiveCamera,
  dom: HTMLElement,
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
): OrbitControls {
  const controls = new OrbitControls(camera, dom)
  controls.enableDamping = true
  controls.dampingFactor = 0.04
  controls.rotateSpeed = 0.6
  controls.enablePan = false
  controls.minDistance = 4
  controls.maxDistance = 18
  controls.autoRotate = !reducedMotion
  controls.autoRotateSpeed = 0.25

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  controls.addEventListener('start', () => {
    controls.autoRotate = false
    clearTimeout(idleTimer)
  })
  controls.addEventListener('end', () => {
    if (reducedMotion) return
    idleTimer = setTimeout(() => {
      controls.autoRotate = true
    }, IDLE_RESUME_MS)
  })

  return controls
}
