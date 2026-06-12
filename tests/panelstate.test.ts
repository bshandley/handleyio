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

describe('panelstate: click and pin', () => {
  it('click pins the panel; it survives idle frames', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    runFrames(s, 600, {})
    expect(visibleId(s)).toBe('email')
  })

  it('hovering another node shows it, then the pin restores', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    runFrames(s, 2, { hitId: 'github' })
    expect(visibleId(s)).toBe('github')
    runFrames(s, 1, {})
    expect(visibleId(s)).toBe('email') // immediate restore, no grace
  })

  it('escape closes a pinned panel', () => {
    const s = initialState()
    fire(s, { type: 'pin', id: 'email' })
    fire(s, { type: 'escape' })
    expect(visibleId(s)).toBeNull()
  })

  it('empty click closes a pinned panel', () => {
    const s = initialState()
    fire(s, { type: 'click', id: 'email' })
    fire(s, { type: 'clickEmpty' })
    expect(visibleId(s)).toBeNull()
  })

  it('clear dismisses like escape (chevron flight start)', () => {
    const s = initialState()
    fire(s, { type: 'pin', id: 'email' })
    fire(s, { type: 'clear' })
    expect(visibleId(s)).toBeNull()
  })
})

describe('panelstate: focus mode', () => {
  it('opens when the user centers a node', () => {
    const s = initialState()
    // the userActive=false half of this gate is pinned by the next test
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBe('pliny')
  })

  it('never opens without user activity', () => {
    const s = initialState()
    runFrames(s, 3600, { focusId: 'pliny', userActive: false })
    expect(visibleId(s)).toBeNull()
  })

  it('stays open while the node is centered after activity decays', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    runFrames(s, 600, { focusId: 'pliny', userActive: false })
    expect(visibleId(s)).toBe('pliny')
  })

  it('closes after grace when the node leaves the zone', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'pliny', userActive: true })
    runFrames(s, Math.ceil(CLOSE_GRACE / (1 / 60)) + 2, {})
    expect(visibleId(s)).toBeNull()
  })

  it('does not hold an unrelated lingering panel open (v1 quirk, normalized)', () => {
    const s = initialState()
    runFrames(s, 2, { hitId: 'github' })
    // github hover ends, pliny dwells in the zone without user activity
    runFrames(s, Math.ceil(CLOSE_GRACE / (1 / 60)) + 2, { focusId: 'pliny' })
    expect(visibleId(s)).toBeNull()
  })

  it('a focus panel is not held by a different node entering the zone', () => {
    const s = initialState()
    runFrames(s, 2, { focusId: 'github', userActive: true })
    expect(visibleId(s)).toBe('github')
    // github leaves; pliny dwells in the zone with no user activity
    runFrames(s, Math.ceil(CLOSE_GRACE / DT) + 2, { focusId: 'pliny' })
    expect(visibleId(s)).toBeNull()
  })
})

describe('panelstate: production regressions', () => {
  it('BRA-61: a dismissed node cannot focus-reopen during its whole dwell', () => {
    const s = initialState()
    // user rotates pliny to center, focus opens
    runFrames(s, 5, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBe('pliny')
    // user clicks empty space to dismiss while pliny is still centered
    step(s, frame({ focusId: 'pliny', userActive: true, events: [{ type: 'clickEmpty' }] }))
    // pliny dwells in the zone for 60 simulated seconds, user stays active
    runFrames(s, 3600, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBeNull()
    // pliny leaves the zone, then comes back with the user active: reopens
    runFrames(s, 120, { userActive: true })
    runFrames(s, 5, { focusId: 'pliny', userActive: true })
    expect(visibleId(s)).toBe('pliny')
  })

  it('BRA-62: page load with a node in the zone and idle drift never opens', () => {
    const s = initialState()
    // wide-aspect load: pliny sits in the zone from frame zero, no user input
    runFrames(s, 18000, { focusId: 'pliny', userActive: false }) // 5 sim-minutes
    expect(visibleId(s)).toBeNull()
  })

  it('BRA-63: a stationary press-release (empty click) opens nothing', () => {
    const s = initialState()
    runFrames(s, 60, { focusId: 'pliny' })
    // stationary click on empty space: no pointer travel, so never userActive
    step(s, frame({ focusId: 'pliny', events: [{ type: 'clickEmpty' }] }))
    runFrames(s, 600, { focusId: 'pliny', userActive: false })
    expect(visibleId(s)).toBeNull()
  })

  it('chevron flight: dismissal suppresses nodes sweeping the center', () => {
    const s = initialState()
    fire(s, { type: 'clear' }) // flight start closes any panel
    // during the 1s sweep window other nodes transit the zone; the camera
    // motion is not user-driven, and even if it were, suppression holds
    runFrames(s, 30, { focusId: 'email', userActive: true }) // 0.5s
    expect(visibleId(s)).toBeNull()
    // arrival pins the target
    fire(s, { type: 'pin', id: 'github' })
    expect(visibleId(s)).toBe('github')
  })
})
