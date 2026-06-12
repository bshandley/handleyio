import { describe, expect, it } from 'vitest'
import {
  CLOSE_GRACE,
  initialState,
  step,
  visibleId,
  type FrameInputs,
  type PanelEvent,
  type PanelState,
} from '../src/interaction/panelstate'

const DT = 1 / 60

function frame(over: Partial<FrameInputs> = {}): FrameInputs {
  return {
    dt: DT,
    hitId: null,
    pointerOverPanel: false,
    focusId: null,
    userActive: false,
    events: [],
    ...over,
  }
}

function runFrames(s: PanelState, n: number, over: Partial<FrameInputs> = {}): void {
  for (let i = 0; i < n; i++) step(s, frame(over))
}

function fire(s: PanelState, ...events: PanelEvent[]): void {
  step(s, frame({ events }))
}

describe('panelstate: hover', () => {
  it('starts closed', () => {
    expect(visibleId(initialState())).toBeNull()
  })

  it('opens on hover and stays while the pointer is on the beacon', () => {
    const s = initialState()
    runFrames(s, 5, { hitId: 'github' })
    expect(visibleId(s)).toBe('github')
  })

  it('switches hover target immediately', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    runFrames(s, 1, { hitId: 'email' })
    expect(visibleId(s)).toBe('email')
  })

  it('closes a hover panel only after the grace window', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    runFrames(s, Math.floor(CLOSE_GRACE / DT) - 2, {})
    expect(visibleId(s)).toBe('github') // still inside grace
    runFrames(s, 10, {})
    expect(visibleId(s)).toBeNull()
  })

  it('the pointer resting on the panel holds it open past grace', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    runFrames(s, 120, { pointerOverPanel: true })
    expect(visibleId(s)).toBe('github')
  })
})

describe('panelstate: cross-mode seams', () => {
  it('hovering the focused beacon then leaving keeps the focus hold', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBe('pliny')
    // activity decays, then the pointer brushes the centered beacon and leaves
    runFrames(s, 2, { focusId: 'pliny', hitId: 'pliny' })
    runFrames(s, 120, { focusId: 'pliny' })
    expect(visibleId(s)).toBe('pliny') // still centered: must not grace-close
  })

  it('the pointer resting on a hovered panel is not swapped to the pin', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    runFrames(s, 2, { hitId: 'github' })
    runFrames(s, 10, { pointerOverPanel: true })
    expect(visibleId(s)).toBe('github')
    // leaving the panel restores the pin
    runFrames(s, 2, {})
    expect(visibleId(s)).toBe('email')
  })

  it('escape while hovering closes, then continued hover reopens', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    step(s, frame({ hitId: 'github', events: [{ type: 'escape' }] }))
    // same-frame: hover wins again after the dismissal (parity with v1)
    expect(visibleId(s)).toBe('github')
  })

  it('a focus hold suspended by hover does not restore after its node leaves', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    runFrames(s, 2, { focusId: 'pliny', hitId: 'github' }) // hover another beacon
    runFrames(s, 2, { hitId: 'github' }) // pliny leaves the zone while hovering
    runFrames(s, 1, {}) // unhover
    expect(visibleId(s)).not.toBe('pliny') // no phantom flash of the departed node
  })

  it('escape while hovering kills the suspended pin too', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    runFrames(s, 2, { hitId: 'github' })
    step(s, frame({ hitId: 'github', events: [{ type: 'escape' }] }))
    runFrames(s, 120, {}) // unhover, run past grace
    expect(visibleId(s)).toBeNull() // email must not resurrect
  })
})
