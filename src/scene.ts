import { Clock, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { createGalaxy, type Galaxy } from './galaxy/galaxy'
import { createStarfield } from './galaxy/starfield'

export interface GalaxyScene {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  galaxy: Galaxy
  onFrame(cb: (dt: number, elapsed: number) => void): void
  start(): void
}

export function hasWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function createScene(container: HTMLElement, particleCount: number): GalaxyScene {
  const scene = new Scene()
  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200)
  camera.position.set(0, 3.2, 7.5)

  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  container.appendChild(renderer.domElement)

  const galaxy = createGalaxy({ count: particleCount })
  scene.add(galaxy.points)
  scene.add(createStarfield())

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new Clock()
  const frameCbs: Array<(dt: number, elapsed: number) => void> = []
  // Start well into the swirl so differential rotation has already sheared
  // the arms out of their symmetric phases (scaled with orbitalSpeed).
  let elapsed = 160
  let running = true
  let contextLost = false
  galaxy.setTime(elapsed)

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    contextLost = true
    running = false
    const note = document.createElement('div')
    note.className = 'hud-panel open context-lost'
    const msg = document.createElement('div')
    msg.className = 'hud-line'
    msg.textContent = 'RENDER LINK LOST'
    const btn = document.createElement('button')
    btn.className = 'hud-action'
    btn.textContent = 'Reload'
    btn.addEventListener('click', () => location.reload())
    note.append(msg, btn)
    document.getElementById('hud')!.append(note)
  })

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden && !contextLost
    if (running) clock.getDelta() // swallow the hidden-time delta
  })

  function tick() {
    requestAnimationFrame(tick)
    if (!running) return
    const dt = Math.min(clock.getDelta(), 0.1)
    if (!reducedMotion) {
      elapsed += dt
      galaxy.setTime(elapsed)
    }
    for (const cb of frameCbs) cb(dt, elapsed)
    renderer.render(scene, camera)
    window.__frameCount = (window.__frameCount ?? 0) + 1
  }

  return {
    scene,
    camera,
    renderer,
    galaxy,
    onFrame: (cb) => void frameCbs.push(cb),
    start: tick,
  }
}

declare global {
  interface Window {
    __frameCount?: number
    __nodeScreen?: (id: string) => { x: number; y: number }
  }
}
