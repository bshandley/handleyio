import { Raycaster, Vector2 } from 'three'
import type { PerspectiveCamera } from 'three'
import { focusedNode } from './camera/focus'
import type { Beacons } from './nodes/beacons'
import { nodeById, NODES } from './nodes/registry'
import type { Hud } from './hud/panel'

export function wireInteraction(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  beacons: Beacons,
  hud: Hud,
): (dt: number) => void {
  const ray = new Raycaster()
  const pointer = new Vector2()
  let pointerOnCanvas = false
  let hoverId: string | null = null
  let pinnedId: string | null = null // set by tap/click/keyboard, survives focus drift
  let downX = 0
  let downY = 0

  function openNode(id: string) {
    hud.open(nodeById(id), beacons.worldPosition(id))
  }

  canvas.addEventListener('pointermove', (e) => {
    pointerOnCanvas = true
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  })
  canvas.addEventListener('pointerleave', () => {
    pointerOnCanvas = false
    hoverId = null
  })
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX
    downY = e.clientY
  })

  canvas.addEventListener('click', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    ray.setFromCamera(pointer, camera)
    const hit = beacons.pick(ray)
    if (hit) {
      pinnedId = hit
      openNode(hit)
    } else {
      pinnedId = null
      hud.close()
    }
  })

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      pinnedId = null
      hud.close()
    }
  })

  // Hidden focusable buttons for keyboard access
  const tabs = document.getElementById('node-tabs')!
  for (const node of NODES) {
    const b = document.createElement('button')
    b.textContent = node.label
    b.addEventListener('focus', () => {
      pinnedId = node.id
      openNode(node.id)
    })
    b.addEventListener('click', () => {
      const primary = node.actions.find((a) => a.kind === 'open')
      if (primary) open(primary.href, '_blank', 'noopener')
    })
    tabs.append(b)
  }

  const candidates = NODES.map((n) => ({ id: n.id, position: beacons.worldPosition(n.id) }))

  // Grace period before a hover/focus panel closes, so the pointer can
  // travel from the beacon onto the panel without it vanishing.
  const CLOSE_GRACE = 0.35
  let graceT = 0

  return function update(dt: number) {
    // hover (desktop)
    if (pointerOnCanvas) {
      ray.setFromCamera(pointer, camera)
      const hit = beacons.pick(ray)
      if (hit && hit !== hoverId) {
        hoverId = hit
        openNode(hit)
      } else if (!hit && hoverId) {
        hoverId = null
        if (pinnedId && hud.openId() !== pinnedId) openNode(pinnedId)
      }
    }

    // focus mode (rotating a node to screen center) and deferred closing
    if (hoverId || pinnedId || hud.pointerOver()) {
      graceT = 0
    } else {
      const f = focusedNode(candidates, camera)
      if (f) {
        graceT = 0
        if (hud.openId() !== f) openNode(f)
      } else if (hud.openId()) {
        graceT += dt
        if (graceT > CLOSE_GRACE) hud.close()
      }
    }

    hud.update(camera)
  }
}
