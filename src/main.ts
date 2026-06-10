import { createControls } from './camera/controls'
import { createHud } from './hud/panel'
import { createBeacons } from './nodes/beacons'
import { NODES } from './nodes/registry'
import { createScene, hasWebgl } from './scene'
import { wireInteraction } from './interaction'
import { withCache } from './data/source'
import { githubSource } from './data/github'

function init() {
  if (!hasWebgl()) return

  const app = document.getElementById('app')!
  const sceneCtx = createScene(app, 60_000)
  const controls = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)

  const beacons = createBeacons(NODES)
  sceneCtx.scene.add(beacons.group)

  const hud = createHud(
    document.getElementById('hud')!,
    document.getElementById('leader') as unknown as SVGSVGElement,
  )
  const updateInteraction = wireInteraction(
    sceneCtx.camera,
    sceneCtx.renderer.domElement,
    beacons,
    hud,
  )

  let pulseT = 0
  sceneCtx.onFrame((dt) => {
    controls.update()
    pulseT += dt
    beacons.pulse(pulseT)
    updateInteraction(dt)
  })

  sceneCtx.start()
  const sources = [withCache(githubSource)]
  for (const source of sources) {
    source
      .fetchData()
      .then((data) => hud.setLiveLines(source.id, data.lines))
      .catch(() => hud.setLiveLines(source.id, ['live data unavailable']))
  }
  document.getElementById('fallback')!.classList.add('hidden')
}

try {
  init()
} catch (err) {
  console.error('galaxy init failed, fallback remains', err)
}
