import { createControls } from './camera/controls'
import { RENDER_ORDER } from './galaxy/order'
import { createHud } from './hud/panel'
import { createNodeNav } from './hud/nodenav'
import { createTelemetry } from './hud/telemetry'
import { createBeacons } from './nodes/beacons'
import { NODES } from './nodes/registry'
import { createScene, hasWebgl } from './scene'
import { wireInteraction } from './interaction'
import { createHint, HintModel } from './hud/hint'
import { safeStorage, withCache } from './data/source'
import { githubSource } from './data/github'
import { FpsGovernor, LADDER, pickInitialLevel } from './quality'

function init() {
  if (!hasWebgl()) return

  const app = document.getElementById('app')!
  const levelIndex = pickInitialLevel(
    innerWidth,
    innerHeight,
    navigator.hardwareConcurrency ?? 4,
    matchMedia('(pointer: coarse)').matches,
  )
  const sceneCtx = createScene(app, LADDER[levelIndex])
  const governor = new FpsGovernor(levelIndex)
  const rig = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)

  const beacons = createBeacons(NODES)
  beacons.group.renderOrder = RENDER_ORDER.beacons
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

  const hint = createHint(document.getElementById('hud')!, new HintModel(safeStorage()))

  sceneCtx.onFrame((dt, elapsed) => {
    const stepDown = governor.update(dt)
    if (stepDown !== null) {
      sceneCtx.applyLevel(LADDER[stepDown])
      telemetry.setParticles(LADDER[stepDown].stars)
    }
    rig.update(dt)
    beacons.update(elapsed)
    interaction.update(dt)
    hint.update(dt, rig.userActive() || hud.openId() !== null)
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
