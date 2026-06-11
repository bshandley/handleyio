import { Raycaster, Vector2 } from 'three'
import type { PerspectiveCamera } from 'three'
import { createFocusGate, focusedNode } from './camera/focus'
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
  let hoverId: string | null = null
  let pinnedId: string | null = null // set by tap/click/keyboard, survives focus drift
  let downX = 0
  let downY = 0
  // After an explicit dismissal (Escape, empty-space tap, chevron flight)
  // focus mode must not reopen a panel: the timer covers nodes sweeping
  // through center right after dismissal (chevron flight), the gate holds
  // the dismissed node itself for its whole dwell near center (BRA-61).
  const FOCUS_SUPPRESS = 1.0
  let focusSuppressT = 0
  const gate = createFocusGate()

  const candidates = NODES.map((n) => ({ id: n.id, position: beacons.worldPosition(n.id) }))

  function openNode(id: string) {
    hud.open(nodeById(id), beacons.worldPosition(id))
  }

  function dismiss() {
    pinnedId = null
    hoverId = null
    hud.close()
    focusSuppressT = FOCUS_SUPPRESS
    gate.dismiss(focusedNode(candidates, camera))
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
      dismiss()
    }
  })

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismiss()
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

  // Grace period before a hover/focus panel closes, so the pointer can
  // travel from the beacon onto the panel without it vanishing.
  const CLOSE_GRACE = 0.35
  let graceT = 0

  function update(dt: number) {
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

    if (focusSuppressT > 0) focusSuppressT -= dt

    // focus mode (rotating a node to screen center) and deferred closing
    if (hoverId || pinnedId || hud.pointerOver()) {
      graceT = 0
    } else {
      const f = focusedNode(candidates, camera)
      const allowed = gate.allow(f, userActive())
      if (f) {
        graceT = 0
        if (focusSuppressT <= 0 && allowed && hud.openId() !== f) openNode(f)
      } else if (hud.openId()) {
        graceT += dt
        if (graceT > CLOSE_GRACE) hud.close()
      }
    }

    hud.update(camera)
  }

  return {
    update,
    pin(id) {
      pinnedId = id
      openNode(id)
    },
    clear: dismiss,
  }
}
