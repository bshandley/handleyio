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

  canvas.addEventListener('click', (e) => {
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

  return function update() {
    // hover (desktop)
    if (pointerOnCanvas) {
      ray.setFromCamera(pointer, camera)
      const hit = beacons.pick(ray)
      if (hit && hit !== hoverId) {
        hoverId = hit
        openNode(hit)
      } else if (!hit && hoverId) {
        hoverId = null
        if (!pinnedId) hud.close()
      }
    }

    // focus mode (rotating a node to screen center)
    if (!hoverId && !pinnedId) {
      const f = focusedNode(candidates, camera)
      if (f && hud.openId() !== f) openNode(f)
      else if (!f && hud.openId()) hud.close()
    }

    hud.update(camera)
  }
}
