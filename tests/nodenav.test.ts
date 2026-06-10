import { describe, expect, it } from 'vitest'
import { nextNode } from '../src/hud/nodenav'

describe('nextNode', () => {
  const angles = [0, 2, 4]

  it('picks the nearest node in the positive direction', () => {
    expect(nextNode(0, angles, 1)).toBe(1)
    expect(nextNode(2.5, angles, 1)).toBe(2)
  })

  it('picks the nearest node in the negative direction, wrapping', () => {
    // from 0 going negative, the nearest is the node at 4 (one wrap down)
    expect(nextNode(0, angles, -1)).toBe(2)
  })

  it('skips the node the camera is already centered on', () => {
    expect(nextNode(2.01, angles, 1)).toBe(2)
    expect(nextNode(2.01, angles, -1)).toBe(0)
  })

  it('returns -1 when there are no nodes', () => {
    expect(nextNode(1, [], 1)).toBe(-1)
  })
})
