import { describe, expect, it } from 'vitest'
import { NODES, nodeById } from '../src/nodes/registry'

describe('node registry', () => {
  it('contains github, email, linkedin', () => {
    expect(NODES.map((n) => n.id).sort()).toEqual(['email', 'github', 'linkedin'])
  })

  it('every node has a primary action and a 3d position', () => {
    for (const n of NODES) {
      expect(n.actions.length).toBeGreaterThan(0)
      expect(n.position).toHaveLength(3)
      expect(n.label.length).toBeGreaterThan(0)
      expect(n.designation).toMatch(/NODE \d\d/)
    }
  })

  it('nodeById returns the node or throws', () => {
    expect(nodeById('github').dataSourceId).toBe('github')
    expect(() => nodeById('nope')).toThrow()
  })
})
