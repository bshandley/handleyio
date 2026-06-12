// Panel-visibility state machine. Pure logic: no Three, no DOM.
// step() mutates the state in place: the render loop allows zero
// per-frame allocations, so a fresh state object per frame is out.
// Mode objects are allocated only on transitions.

export type Mode =
  | { readonly kind: 'closed' }
  | { readonly kind: 'hover'; readonly id: string; readonly returnTo: Mode | null }
  | { readonly kind: 'pinned'; readonly id: string }
  | { readonly kind: 'focus'; readonly id: string }

export interface PanelState {
  mode: Mode
  /** Counts up while nothing claims an open panel; closes it past CLOSE_GRACE. */
  graceT: number
  /** Post-dismissal window blocking focus-opens for nodes sweeping center. */
  suppressT: number
  /** Dismissed node: focus may not reopen it until it leaves the focus zone. */
  dismissedId: string | null
}

export type PanelEvent =
  | { type: 'click'; id: string }
  | { type: 'clickEmpty' }
  | { type: 'escape' }
  | { type: 'pin'; id: string }
  | { type: 'clear' }

export interface FrameInputs {
  dt: number
  /** Beacon under the pointer (null when none, or pointer off canvas). */
  hitId: string | null
  pointerOverPanel: boolean
  /** Node inside the screen-center focus zone. */
  focusId: string | null
  /** User-driven camera motion within the idle window (rig.userActive). */
  userActive: boolean
  /** Discrete events since the previous frame; cleared by the caller. */
  events: PanelEvent[]
}

export const CLOSE_GRACE = 0.35
export const FOCUS_SUPPRESS = 1.0

const CLOSED: Mode = { kind: 'closed' } // shared: modes are never mutated

export function initialState(): PanelState {
  return { mode: CLOSED, graceT: 0, suppressT: 0, dismissedId: null }
}

export function visibleId(s: PanelState): string | null {
  return s.mode.kind === 'closed' ? null : s.mode.id
}

export function step(s: PanelState, f: FrameInputs): void {
  // 1. Discrete events first: explicit intent beats continuous inputs.
  for (const e of f.events) {
    if (e.type === 'click' || e.type === 'pin') {
      s.mode = { kind: 'pinned', id: e.id }
    } else {
      // clickEmpty | escape | clear: explicit dismissal. Spec: hold the
      // focused node until it leaves the zone, plus a sweep timer.
      // dismissedId samples focusId at frame time; suppressT covers the gap
      // between the event and the focus zone updating on subsequent frames.
      s.mode = CLOSED
      s.suppressT = FOCUS_SUPPRESS
      s.dismissedId = f.focusId
    }
    s.graceT = 0
  }

  // 2. Timers; release the dismissal once the node leaves the zone.
  if (s.suppressT > 0) s.suppressT = Math.max(0, s.suppressT - f.dt)
  if (s.dismissedId !== null && f.focusId !== s.dismissedId) s.dismissedId = null

  // 3. Hover wins over everything visible.
  if (f.hitId !== null) {
    if (!(s.mode.kind === 'hover' && s.mode.id === f.hitId)) {
      // returnTo: carry through a nested hover's returnTo; otherwise snapshot
      // the current mode so unhover can restore it (focus, pinned, or null).
      const returnTo = s.mode.kind === 'hover' ? s.mode.returnTo
                     : s.mode.kind === 'closed' ? null
                     : s.mode
      s.mode = { kind: 'hover', id: f.hitId, returnTo }
    }
    s.graceT = 0
    return
  }

  // 4. Hover ended: restore the suspended mode, unless it is a focus hold
  // whose node has left the zone (a stale restore would flash its panel).
  if (s.mode.kind === 'hover' && s.mode.returnTo !== null && !f.pointerOverPanel) {
    const r = s.mode.returnTo
    if (r.kind !== 'focus' || r.id === f.focusId) s.mode = r
    // stale focus: leave the hover in place; step 8 grace-closes it
  }

  // 5. Pinned panels stay; the pointer resting on the panel holds it too.
  if (s.mode.kind === 'pinned' || f.pointerOverPanel) {
    s.graceT = 0
    return
  }

  // 6. An open focus panel holds while its node stays centered (the user
  // stopped to read; idle decay of userActive must not close it).
  if (s.mode.kind === 'focus' && s.mode.id === f.focusId) {
    s.graceT = 0
    return
  }

  // 7. Focus-open: user-driven centering only, never a dismissed node.
  if (
    f.focusId !== null &&
    f.userActive &&
    s.suppressT <= 0 &&
    f.focusId !== s.dismissedId
  ) {
    s.mode = { kind: 'focus', id: f.focusId }
    s.graceT = 0
    return
  }

  // 8. Nothing claims the panel: close it after the grace window.
  if (s.mode.kind !== 'closed') {
    s.graceT += f.dt
    if (s.graceT > CLOSE_GRACE) {
      s.mode = CLOSED
      s.graceT = 0
    }
  }
}
