import { createControls } from './camera/controls'
import { createScene, hasWebgl } from './scene'
import { createBeacons } from './nodes/beacons'
import { NODES } from './nodes/registry'

function init() {
  if (!hasWebgl()) return // fallback section stays visible

  const app = document.getElementById('app')!
  const sceneCtx = createScene(app, 60_000)
  const controls = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)
  sceneCtx.onFrame(() => controls.update())
  const beacons = createBeacons(NODES)
  sceneCtx.scene.add(beacons.group)
  let pulseT = 0
  sceneCtx.onFrame((dt) => {
    pulseT += dt
    beacons.pulse(pulseT)
  })
  sceneCtx.start()
  document.getElementById('fallback')!.classList.add('hidden')
}

try {
  init()
} catch (err) {
  console.error('galaxy init failed, fallback remains', err)
}
