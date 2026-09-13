import type { Camera, Vector3 } from 'three'
import { toScreenInto, type ScreenPos } from './projector'

// Persistent designation tags beside each beacon: the sector-map framing.
// Pure rules are exported for tests; DOM work stays in createTags. Writes
// happen only when a rounded screen position or visibility changes.

/** Tags are hidden at and below this CSS width (phones: chevrons and wordmark fill the bottom). */
export const TAG_MAX_WIDTH = 640
const OFFSET_X = 10
const OFFSET_Y = -14

export function tagFor(node: { tag?: string; designation: string }): string {
  return node.tag ?? node.designation.split(' · ')[0]
}

export function tagVisible(input: {
  id: string
  openId: string | null
  onScreen: boolean
  width: number
}): boolean {
  return input.onScreen && input.openId !== input.id && input.width > TAG_MAX_WIDTH
}

export interface Tags {
  update(camera: Camera): void
}

export function createTags(
  root: HTMLElement,
  nodes: Array<{ id: string; tag?: string; designation: string }>,
  position: (id: string) => Vector3,
  openId: () => string | null,
): Tags {
  const entries = nodes.map((node) => {
    const el = document.createElement('div')
    el.className = 'hud-tag'
    el.textContent = tagFor(node)
    el.setAttribute('aria-hidden', 'true')
    root.append(el)
    const screen: ScreenPos = { x: 0, y: 0, visible: false }
    return { id: node.id, el, x: NaN, y: NaN, shown: true, screen }
  })

  return {
    update(camera) {
      const open = openId()
      for (const entry of entries) {
        const s = toScreenInto(position(entry.id), camera, innerWidth, innerHeight, entry.screen)
        const visible = tagVisible({ id: entry.id, openId: open, onScreen: s.visible, width: innerWidth })
        if (visible !== entry.shown) {
          entry.el.hidden = !visible
          entry.shown = visible
        }
        if (!visible) continue
        const x = Math.round(s.x + OFFSET_X)
        const y = Math.round(s.y + OFFSET_Y)
        if (x !== entry.x || y !== entry.y) {
          entry.x = x
          entry.y = y
          entry.el.style.transform = `translate(${x}px, ${y}px)`
        }
      }
    },
  }
}
