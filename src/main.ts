import { createControls } from './camera/controls'
import { createHud } from './hud/panel'
import { createNodeNav } from './hud/nodenav'
import { createTelemetry } from './hud/telemetry'
import { createBeacons } from './nodes/beacons'
import { NODES } from './nodes/registry'
import { createScene, hasWebgl } from './scene'
import { wireInteraction } from './interaction'
import { withCache } from './data/source'
import { githubSource } from './data/github'
import { FpsGovernor, pickInitialCount } from './quality'

function init() {
  if (!hasWebgl()) return

  const app = document.getElementById('app')!
  const count = pickInitialCount(innerWidth, innerHeight, navigator.hardwareConcurrency ?? 4)
  const sceneCtx = createScene(app, count)
  const governor = new FpsGovernor(count)
  const rig = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)

  const beacons = createBeacons(NODES)
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
  telemetry.setParticles(count)

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

  sceneCtx.onFrame((dt, elapsed) => {
    const stepDown = governor.update(dt)
    if (stepDown !== null) {
      sceneCtx.galaxy.rebuild(stepDown)
      telemetry.setParticles(stepDown)
    }
    rig.update(dt)
    beacons.update(elapsed)
    interaction.update(dt)
    telemetry.setActiveNode(hud.openId())
    telemetry.update(dt, elapsed)
  })

  sceneCtx.start()
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
  document.getElementById('fallback')!.classList.add('hidden')
}

try {
  init()
} catch (err) {
  console.error('galaxy init failed, fallback remains', err)
}
