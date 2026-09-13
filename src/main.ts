import { createControls } from './camera/controls'
import { RENDER_ORDER } from './galaxy/order'
import { createHud } from './hud/panel'
import { createNodeNav } from './hud/nodenav'
import { createTelemetry } from './hud/telemetry'
import { createBeacons } from './nodes/beacons'
import { NODES } from './nodes/registry'
import { createScene, probeGl } from './scene'
import { wireInteraction } from './interaction'
import { createHint, HintModel } from './hud/hint'
import { safeStorage, withCache } from './data/source'
import { githubSource } from './data/github'
import { FpsGovernor, isSoftwareRenderer, LADDER, parseLevelParam, pickInitialLevel } from './quality'

function init() {
  const gl = probeGl()
  if (!gl.ok) return

  const app = document.getElementById('app')!
  // ?level=N pins a quality level for tuning and screenshots; the governor
  // stays out of the way so the capture shows the level that was asked for.
  const pinned = parseLevelParam(location.search)
  const levelIndex =
    pinned ??
    pickInitialLevel(
      innerWidth,
      innerHeight,
      navigator.hardwareConcurrency ?? 4,
      matchMedia('(pointer: coarse)').matches,
      isSoftwareRenderer(gl.renderer),
    )
  const sceneCtx = createScene(app, LADDER[levelIndex])
  const governor = new FpsGovernor(levelIndex)
  const rig = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)

  const beacons = createBeacons(NODES)
  beacons.group.renderOrder = RENDER_ORDER.beacons
  beacons.setViewport(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio)
  sceneCtx.scene.add(beacons.group)

  const hud = createHud(
    document.getElementById('hud')!,
    document.getElementById('leader') as unknown as SVGSVGElement,
  )
  const interaction = wireInteraction(
    sceneCtx.camera,
    sceneCtx.renderer.domElement,
    beacons,
    hud,
    rig.userActive,
  )

  const telemetry = createTelemetry(
    document.getElementById('hud')!,
    rig.controls,
    sceneCtx.renderer,
    NODES.length,
  )
  telemetry.setParticles(LADDER[levelIndex].stars)

  createNodeNav(
    document.getElementById('hud')!,
    rig,
    () => NODES.map((n) => ({ id: n.id, position: beacons.worldPosition(n.id) })),
    interaction.pin,
    interaction.clear,
  )

  // e2e hook: screen-space position of a beacon (test-only, allocates)
  window.__nodeScreen = (id: string) => {
    const v = beacons.worldPosition(id).clone().project(sceneCtx.camera)
    return {
      x: ((v.x + 1) / 2) * innerWidth,
      y: ((1 - v.y) / 2) * innerHeight,
    }
  }

  addEventListener('resize', () => {
    beacons.setViewport(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio)
  })

  const hint = createHint(document.getElementById('hud')!, new HintModel(safeStorage()))

  // Both the hint's delay and the governor's sustain window are wall-clock
  // for the same reason: the render loop's dt is capped per frame, which
  // would stretch a 2 s delay (and a 3 s sustain window) into many seconds
  // at low frame rates (CI software GL). Capped at 1 s so a resumed tab
  // does not jump either one.
  let wallClock = performance.now()

  sceneCtx.onFrame((dt, elapsed) => {
    const now = performance.now()
    const wallDt = Math.min((now - wallClock) / 1000, 1)
    wallClock = now
    const stepDown = pinned === null ? governor.update(wallDt) : null
    if (stepDown !== null) {
      sceneCtx.applyLevel(LADDER[stepDown])
      telemetry.setParticles(LADDER[stepDown].stars)
    }
    rig.update(dt)
    beacons.update(elapsed)
    interaction.update(dt)
    hint.update(wallDt, rig.userActive() || hud.openId() !== null)
    telemetry.setActiveNode(hud.openId())
    telemetry.update(dt, elapsed)
  })

  sceneCtx.start()
  document.getElementById('fallback')!.classList.add('hidden')
  const sources = [withCache(githubSource)]
  for (const source of sources) {
    source
      .fetchData()
      .then((data) => {
        hud.setLiveLines(source.id, data.lines)
        telemetry.setLinkStatus('ok')
      })
      .catch(() => {
        hud.setLiveLines(source.id, ['live data unavailable'])
        telemetry.setLinkStatus('down')
      })
  }
}

try {
  init()
} catch (err) {
  console.error('galaxy init failed, fallback remains', err)
}
