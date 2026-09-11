import { Clock, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { createArmModel } from './galaxy/arms'
import { createDust } from './galaxy/dust'
import { createGalaxy, type Galaxy } from './galaxy/galaxy'
import { createGlow } from './galaxy/glow'
import { createStarfield } from './galaxy/starfield'
import { createPost, type PostChain } from './render/post'

export interface GalaxyScene {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  galaxy: Galaxy
  post: PostChain
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
  // Telemetry reads info.render.calls once per frame; with a post chain each
  // pass would otherwise reset it, leaving only the last pass's count.
  renderer.info.autoReset = false

  const model = createArmModel()
  const galaxy = createGalaxy(model, { count: particleCount }, renderer.getPixelRatio())
  scene.add(galaxy.group)
  const pr = renderer.getPixelRatio()
  const glow = createGlow(model, innerWidth * pr, innerHeight * pr)
  scene.add(glow.mesh)
  const dust = createDust(model, innerWidth * pr, innerHeight * pr)
  scene.add(dust.mesh)
  scene.add(createStarfield())

  const post = createPost(renderer, scene, camera, innerWidth, innerHeight)
  window.__renderPath = post.path

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new Clock()
  const frameCbs: Array<(dt: number, elapsed: number) => void> = []
  // Start well into the swirl so differential rotation has already sheared
  // the arms out of their symmetric phases (scaled with orbitalSpeed).
  let elapsed = 160
  let running = true
  let contextLost = false
  galaxy.setTime(elapsed)
  glow.setTime(elapsed)
  dust.setTime(elapsed)

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
    post.setSize(innerWidth, innerHeight, renderer.getPixelRatio())
    glow.setViewport(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio())
    dust.setViewport(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio())
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
      glow.setTime(elapsed)
      dust.setTime(elapsed)
    }
    galaxy.setCameraSide(camera.position.y >= 0)
    for (const cb of frameCbs) cb(dt, elapsed)
    renderer.info.reset()
    post.render()
    window.__frameCount = (window.__frameCount ?? 0) + 1
  }

  return {
    scene,
    camera,
    renderer,
    galaxy,
    post,
    onFrame: (cb) => void frameCbs.push(cb),
    start: tick,
  }
}

declare global {
  interface Window {
    __frameCount?: number
    __nodeScreen?: (id: string) => { x: number; y: number }
    __renderPath?: 'hdr' | 'direct'
  }
}
