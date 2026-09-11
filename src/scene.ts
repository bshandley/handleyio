import { Clock, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { createArmModel } from './galaxy/arms'
import { createDeepField } from './galaxy/deepfield'
import { createDust, dustFade } from './galaxy/dust'
import { createGalaxy, type Galaxy } from './galaxy/galaxy'
import { createGlow } from './galaxy/glow'
import { createStarfield } from './galaxy/starfield'
import type { QualityLevel } from './quality'
import { createPost, type PostChain } from './render/post'

export interface GalaxyScene {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  galaxy: Galaxy
  post: PostChain
  /** Apply a quality level: star count, layer density, bloom, pixel ratio. */
  applyLevel(level: QualityLevel): void
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

export function createScene(container: HTMLElement, level: QualityLevel): GalaxyScene {
  const scene = new Scene()
  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200)
  camera.position.set(0, 3.2, 7.5)

  const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  let pixelRatio = Math.min(devicePixelRatio, level.pixelRatioCap)
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(innerWidth, innerHeight)
  container.appendChild(renderer.domElement)
  // Telemetry reads info.render.calls once per frame; with a post chain each
  // pass would otherwise reset it, leaving only the last pass's count.
  renderer.info.autoReset = false

  // One arm model for every layer so stars, glow and dust share ridges and spurs.
  const model = createArmModel()
  const galaxy = createGalaxy(model, { count: level.stars }, pixelRatio)
  const glow = createGlow(model, innerWidth * pixelRatio, innerHeight * pixelRatio)
  const dust = createDust(model, innerWidth * pixelRatio, innerHeight * pixelRatio)
  const starfield = createStarfield(pixelRatio)
  const deepField = createDeepField(innerWidth * pixelRatio, innerHeight * pixelRatio)
  scene.add(starfield.points, deepField.mesh, glow.mesh, galaxy.group, dust.mesh)

  const post = createPost(renderer, scene, camera, innerWidth, innerHeight)
  window.__renderPath = post.path

  let currentStars = level.stars
  const layout = () => {
    const w = innerWidth * pixelRatio
    const h = innerHeight * pixelRatio
    post.setSize(innerWidth, innerHeight, pixelRatio)
    galaxy.setPixelRatio(pixelRatio)
    starfield.setPixelRatio(pixelRatio)
    glow.setViewport(w, h)
    dust.setViewport(w, h)
    deepField.setViewport(w, h)
  }
  const applyLevel = (next: QualityLevel) => {
    if (next.stars !== currentStars) {
      galaxy.rebuild(next.stars)
      currentStars = next.stars
    }
    glow.setFraction(next.glow)
    dust.setFraction(next.dust)
    post.setBloom(next.bloom)
    pixelRatio = Math.min(devicePixelRatio, next.pixelRatioCap)
    layout()
  }
  applyLevel(level)

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const clock = new Clock()
  const frameCbs: Array<(dt: number, elapsed: number) => void> = []
  // Start well into the swirl so differential rotation has already sheared
  // the arms out of their symmetric phases (scaled with orbitalSpeed).
  let elapsed = 160
  let running = true
  let contextLost = false
  const setTime = (t: number) => {
    galaxy.setTime(t)
    glow.setTime(t)
    dust.setTime(t)
  }
  setTime(elapsed)

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
    layout()
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
      setTime(elapsed)
    }
    galaxy.setCameraSide(camera.position.y >= 0)
    dust.setFade(dustFade(camera.position.y / camera.position.length()))
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
    applyLevel,
    onFrame: (cb) => void frameCbs.push(cb),
    start: tick,
  }
}

declare global {
  interface Window {
    __frameCount?: number
    __renderPath?: 'hdr' | 'direct'
    __nodeScreen?: (id: string) => { x: number; y: number }
  }
}
