import type { WebGLRenderer } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Ambient viewport telemetry: dim, informational, all real data.
// Pure helpers are exported for unit tests; DOM work stays in createTelemetry.

export function bearingDeg(rad: number): string {
  const deg = ((((rad * 180) / Math.PI) % 360) + 360) % 360
  return String(Math.round(deg) % 360).padStart(3, '0')
}

export function padCount(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

export class FpsMeter {
  private value = 60

  update(dt: number): void {
    if (dt > 0) this.value += (1 / dt - this.value) * 0.05
  }

  read(): number {
    return Math.round(this.value)
  }
}

export interface Telemetry {
  update(dt: number, elapsed: number): void
  setParticles(n: number): void
  setLinkStatus(status: 'pending' | 'ok' | 'down'): void
  setActiveNode(id: string | null): void
}

// Matches the activation threshold in camera/focus.ts (NDC distance 0.22).
const FOCUS_THRESHOLD = 0.22
const TEXT_REFRESH_S = 0.1

export function createTelemetry(
  root: HTMLElement,
  controls: OrbitControls,
  renderer: WebGLRenderer,
  nodeCount: number,
): Telemetry {
  const make = (cls: string, parent: HTMLElement = root) => {
    const div = document.createElement('div')
    div.className = cls
    parent.append(div)
    return div
  }
  const lines = (parent: HTMLElement, n: number) =>
    Array.from({ length: n }, () => make('hud-tele-line', parent))

  for (const pos of ['tl', 'tr', 'bl', 'br']) make(`hud-corner hud-corner-${pos}`)

  const sector = make('hud-tele hud-tele-tl')
  const [sectorTitle, utcLine, simLine] = lines(sector, 3)
  sectorTitle.textContent = 'SECTOR MAP · HND-IO'

  const render = make('hud-tele hud-tele-tr')
  const [fpsLine, starsLine, drawLine] = lines(render, 3)

  const nav = make('hud-tele hud-tele-br')
  const [brgLine, incLine, rngLine] = lines(nav, 3)

  const status = make('hud-tele hud-tele-bl')
  const [statusLine] = lines(status, 1)

  const reticle = make('hud-reticle')
  const sizeReticle = () => {
    const d = Math.round(innerHeight * FOCUS_THRESHOLD)
    reticle.style.width = `${d}px`
    reticle.style.height = `${d}px`
  }
  sizeReticle()
  addEventListener('resize', sizeReticle)

  const fps = new FpsMeter()
  let particles = 0
  let link: 'pending' | 'ok' | 'down' = 'pending'
  let acc = TEXT_REFRESH_S // render once on the first frame

  function refreshText(elapsed: number) {
    utcLine.textContent = `UTC ${new Date().toISOString().slice(11, 19)}`
    simLine.textContent = `SIM-T +${padCount(Math.floor(elapsed), 4)}s`
    fpsLine.textContent = `FPS ${padCount(fps.read(), 3)}`
    starsLine.textContent = `STARS ${particles}`
    drawLine.textContent = `DRAW ${padCount(renderer.info.render.calls, 3)}`
    brgLine.textContent = `BRG ${bearingDeg(controls.getAzimuthalAngle())}°`
    incLine.textContent = `INC ${bearingDeg(controls.getPolarAngle())}°`
    rngLine.textContent = `RNG ${controls.getDistance().toFixed(1)}`
    const linkText = link === 'ok' ? 'LINK OK' : link === 'down' ? 'LINK DOWN' : 'LINK ···'
    statusLine.textContent = `NODES ${padCount(nodeCount, 2)} · ${linkText}`
  }

  return {
    update(dt, elapsed) {
      fps.update(dt)
      acc += dt
      if (acc >= TEXT_REFRESH_S) {
        acc = 0
        refreshText(elapsed)
      }
    },
    setParticles(n) {
      particles = n
    },
    setLinkStatus(status) {
      link = status
    },
    setActiveNode(id) {
      reticle.classList.toggle('active', id !== null)
    },
  }
}
