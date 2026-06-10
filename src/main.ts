import { createControls } from './camera/controls'
import { createScene, hasWebgl } from './scene'

function init() {
  if (!hasWebgl()) return // fallback section stays visible

  const app = document.getElementById('app')!
  const sceneCtx = createScene(app, 60_000)
  const controls = createControls(sceneCtx.camera, sceneCtx.renderer.domElement)
  sceneCtx.onFrame(() => controls.update())
  sceneCtx.start()
  document.getElementById('fallback')!.classList.add('hidden')
}

try {
  init()
} catch (err) {
  console.error('galaxy init failed, fallback remains', err)
}
