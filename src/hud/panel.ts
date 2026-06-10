import type { Camera, Vector3 } from 'three'
import type { GalaxyNode, NodeAction } from '../nodes/registry'
import { toScreen } from './projector'

export interface Hud {
  open(node: GalaxyNode, anchor: Vector3): void
  close(): void
  openId(): string | null
  /** True while the pointer is over the panel (keeps hover panels open). */
  pointerOver(): boolean
  setLiveLines(nodeId: string, lines: string[]): void
  update(camera: Camera): void
}

export function createHud(root: HTMLElement, leaderSvg: SVGSVGElement): Hud {
  const el = document.createElement('div')
  el.className = 'hud-panel'
  el.setAttribute('role', 'dialog')
  root.appendChild(el)

  const line = leaderSvg.querySelector('line')!
  const live = new Map<string, string[]>()
  let current: { node: GalaxyNode; anchor: Vector3 } | null = null
  let over = false
  el.addEventListener('pointerenter', () => {
    over = true
  })
  el.addEventListener('pointerleave', () => {
    over = false
  })

  function render(node: GalaxyNode) {
    el.replaceChildren()
    const designation = document.createElement('div')
    designation.className = 'hud-designation'
    designation.textContent = node.designation
    const title = document.createElement('div')
    title.className = 'hud-title'
    title.textContent = node.label
    el.append(designation, title)

    for (const text of [...node.lines, ...(live.get(node.id) ?? [])]) {
      const p = document.createElement('div')
      p.className = 'hud-line'
      p.textContent = text
      el.append(p)
    }

    for (const action of node.actions) {
      el.append(actionButton(action))
    }
  }

  function actionButton(action: NodeAction): HTMLElement {
    if (action.kind === 'open') {
      const a = document.createElement('a')
      a.className = 'hud-action'
      a.textContent = action.label
      a.href = action.href
      if (!action.href.startsWith('mailto:')) {
        a.target = '_blank'
        a.rel = 'noopener'
      }
      return a
    }
    const b = document.createElement('button')
    b.className = 'hud-action'
    b.textContent = action.label
    b.addEventListener('click', async () => {
      await navigator.clipboard.writeText(action.text)
      b.textContent = 'Copied ✓'
      setTimeout(() => (b.textContent = action.label), 1500)
    })
    return b
  }

  return {
    open(node, anchor) {
      current = { node, anchor }
      render(node)
      el.classList.add('open')
      line.style.visibility = 'visible'
    },
    close() {
      current = null
      over = false
      el.classList.remove('open')
      line.style.visibility = 'hidden'
    },
    openId: () => current?.node.id ?? null,
    pointerOver: () => over,
    setLiveLines(nodeId, lines) {
      live.set(nodeId, lines)
      if (current?.node.id === nodeId) render(current.node)
    },
    update(camera) {
      if (!current) return
      const s = toScreen(current.anchor, camera, innerWidth, innerHeight)
      if (!s.visible) return
      const px = Math.min(innerWidth - el.offsetWidth - 12, s.x + 28)
      const py = Math.max(12, s.y - el.offsetHeight - 20)
      el.style.transform = `translate(${px}px, ${py}px)`
      line.setAttribute('x1', String(s.x))
      line.setAttribute('y1', String(s.y))
      line.setAttribute('x2', String(px))
      line.setAttribute('y2', String(py + el.offsetHeight))
    },
  }
}
