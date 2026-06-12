import { Raycaster, Vector2 } from 'three'
import type { PerspectiveCamera } from 'three'
import { focusedNode } from './camera/focus'
import {
  initialState,
  step,
  visibleId,
  type FrameInputs,
  type PanelEvent,
} from './interaction/panelstate'
import type { Beacons } from './nodes/beacons'
import { nodeById, NODES } from './nodes/registry'
import type { Hud } from './hud/panel'

export interface Interaction {
  update(dt: number): void
  /** Open a node's panel and keep it open (used by chevron navigation). */
  pin(id: string): void
  /** Close any open panel and forget the pin (chevron flight start). */
  clear(): void
}

// Adapter: DOM events and raycasts in, HUD open/close out. All visibility
// decisions live in interaction/panelstate.ts.
export function wireInteraction(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  beacons: Beacons,
  hud: Hud,
  userActive: () => boolean,
): Interaction {
  const ray = new Raycaster()
  const pointer = new Vector2()
  let pointerOnCanvas = false
  let downX = 0
  let downY = 0

  const state = initialState()
  const events: PanelEvent[] = []
  const inputs: FrameInputs = {
    dt: 0,
    hitId: null,
    pointerOverPanel: false,
    focusId: null,
    userActive: false,
    events,
  }

  const candidates = NODES.map((n) => ({ id: n.id, position: beacons.worldPosition(n.id) }))

  canvas.addEventListener('pointermove', (e) => {
    pointerOnCanvas = true
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  })
  canvas.addEventListener('pointerleave', () => {
    pointerOnCanvas = false
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
    events.push(hit ? { type: 'click', id: hit } : { type: 'clickEmpty' })
  })

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') events.push({ type: 'escape' })
  })

  // Hidden focusable buttons for keyboard access
  const tabs = document.getElementById('node-tabs')!
  for (const node of NODES) {
    const b = document.createElement('button')
    b.textContent = node.label
    b.addEventListener('focus', () => {
      events.push({ type: 'pin', id: node.id })
    })
    b.addEventListener('click', () => {
      const primary = node.actions.find((a) => a.kind === 'open')
      if (primary) open(primary.href, '_blank', 'noopener')
    })
    tabs.append(b)
  }

  function update(dt: number) {
    inputs.dt = dt
    inputs.hitId = null
    if (pointerOnCanvas) {
      ray.setFromCamera(pointer, camera)
      inputs.hitId = beacons.pick(ray)
    }
    inputs.pointerOverPanel = hud.pointerOver()
    inputs.focusId = focusedNode(candidates, camera)
    inputs.userActive = userActive()

    const prev = visibleId(state)
    step(state, inputs)
    events.length = 0
    const next = visibleId(state)
    if (next !== prev) {
      if (next) hud.open(nodeById(next), beacons.worldPosition(next))
      else hud.close()
    }

    hud.update(camera)
  }

  return {
    update,
    pin(id) {
      events.push({ type: 'pin', id })
    },
    clear() {
      events.push({ type: 'clear' })
    },
  }
}
