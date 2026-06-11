import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFocusGate, focusedNode } from '../src/camera/focus'

const camera = new PerspectiveCamera(55, 2, 0.1, 200)
camera.position.set(0, 0, 10)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
camera.updateProjectionMatrix()

describe('focusedNode', () => {
  it('returns the node nearest screen center within threshold', () => {
    const id = focusedNode(
      [
        { id: 'a', position: new Vector3(0.1, 0, 0) },
        { id: 'b', position: new Vector3(3, 3, 0) },
      ],
      camera,
    )
    expect(id).toBe('a')
  })

  it('returns null when nothing is near center', () => {
    const id = focusedNode([{ id: 'b', position: new Vector3(6, 6, 0) }], camera)
    expect(id).toBeNull()
  })

  it('ignores nodes behind the camera', () => {
    const id = focusedNode([{ id: 'c', position: new Vector3(0, 0, 20) }], camera)
    expect(id).toBeNull()
  })
})

describe('createFocusGate', () => {
  it('allows a node the user rotates into focus', () => {
    const gate = createFocusGate()
    expect(gate.allow('pliny', true)).toBe(true)
  })

  it('blocks any auto-open while camera motion is not user-driven', () => {
    const gate = createFocusGate()
    expect(gate.allow('pliny', false)).toBe(false)
    expect(gate.allow('email', false)).toBe(false)
  })

  it('blocks the dismissed node for as long as it stays focused', () => {
    const gate = createFocusGate()
    gate.dismiss('pliny')
    expect(gate.allow('pliny', true)).toBe(false)
    expect(gate.allow('pliny', true)).toBe(false)
  })

  it('keeps suppressing a dismissed node across an idle stretch', () => {
    const gate = createFocusGate()
    gate.dismiss('pliny')
    expect(gate.allow('pliny', false)).toBe(false)
    expect(gate.allow('pliny', true)).toBe(false)
  })

  it('lifts suppression once the dismissed node leaves focus', () => {
    const gate = createFocusGate()
    gate.dismiss('pliny')
    expect(gate.allow(null, true)).toBe(false)
    expect(gate.allow('pliny', true)).toBe(true)
  })

  it('opens a different node immediately and forgets the dismissal', () => {
    const gate = createFocusGate()
    gate.dismiss('pliny')
    expect(gate.allow('email', true)).toBe(true)
    expect(gate.allow('pliny', true)).toBe(true)
  })

  it('dismissing with no focused node suppresses nothing', () => {
    const gate = createFocusGate()
    gate.dismiss(null)
    expect(gate.allow('pliny', true)).toBe(true)
  })
})
