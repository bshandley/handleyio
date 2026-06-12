// First-visit hint: an in-fiction directive typed beneath the focus
// reticle. Model is pure and unit-tested; DOM work stays in createHint.

export const HINT_DELAY_S = 2
export const HINT_KEY = 'handleyio:hint-seen'
export const HINT_LINES = [
  'MANUAL CONTROL AVAILABLE',
  'DRAG TO ROTATE SECTOR · BEACONS RESPOND TO CONTACT',
]

export type HintPhase = 'pending' | 'visible' | 'done'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class HintModel {
  private t = 0
  private phase: HintPhase

  constructor(private storage: StorageLike) {
    let seen = false
    try {
      seen = storage.getItem(HINT_KEY) === '1'
    } catch {
      // blocked storage: the hint shows every visit, which is acceptable
    }
    this.phase = seen ? 'done' : 'pending'
  }

  tick(dt: number): void {
    if (this.phase !== 'pending') return
    this.t += dt
    if (this.t >= HINT_DELAY_S) this.phase = 'visible'
  }

  interact(): void {
    if (this.phase === 'done') return
    this.phase = 'done'
    try {
      this.storage.setItem(HINT_KEY, '1')
    } catch {
      // best effort
    }
  }

  state(): HintPhase {
    return this.phase
  }
}

const TYPE_MS = 35
const FADE_MS = 300

export interface Hint {
  /** Call per frame. interacted: any qualifying user interaction this frame. */
  update(dt: number, interacted: boolean): void
}

export function createHint(
  root: HTMLElement,
  model: HintModel,
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
): Hint {
  const el = document.createElement('div')
  el.className = 'hud-hint'
  el.setAttribute('aria-hidden', 'true')
  const rows = HINT_LINES.map(() => {
    const r = document.createElement('div')
    el.append(r)
    return r
  })
  root.append(el)

  let shown: HintPhase = 'pending' // last phase reflected in the DOM

  function show() {
    el.classList.add('open')
    document.querySelector('.hud-reticle')?.classList.add('hint')
    if (reducedMotion) {
      HINT_LINES.forEach((line, i) => (rows[i].textContent = line))
      return
    }
    // typing runs on its own timer, never in the render loop
    let row = 0
    let chars = 0
    const timer = setInterval(() => {
      if (shown === 'done' || row >= HINT_LINES.length) {
        clearInterval(timer)
        return
      }
      chars++
      rows[row].textContent = HINT_LINES[row].slice(0, chars)
      if (chars >= HINT_LINES[row].length) {
        row++
        chars = 0
      }
    }, TYPE_MS)
  }

  function hide() {
    el.classList.remove('open')
    document.querySelector('.hud-reticle')?.classList.remove('hint')
    setTimeout(() => el.remove(), FADE_MS)
  }

  return {
    update(dt, interacted) {
      if (shown === 'done') return
      if (interacted) model.interact()
      else model.tick(dt)
      const phase = model.state()
      if (phase === shown) return
      if (phase === 'visible') show()
      if (phase === 'done') {
        if (shown === 'visible') hide()
        else el.remove() // never shown (returning visitor or pre-delay interact): drop the empty div
      }
      shown = phase
    },
  }
}
