import { describe, expect, it } from 'vitest'
import { NODES, nodeById } from '../src/nodes/registry'

describe('node registry', () => {
  it('contains github, email, linkedin, pliny, gatehouse', () => {
    expect(NODES.map((n) => n.id).sort()).toEqual([
      'email',
      'gatehouse',
      'github',
      'linkedin',
      'pliny',
    ])
  })

  it('gives every node a distinct designation and a separated azimuth', () => {
    const designations = new Set(NODES.map((n) => n.designation))
    expect(designations.size).toBe(NODES.length)
    // chevron nav and focus rely on nodes not stacking at the same angle
    const azimuths = NODES.map((n) => Math.atan2(n.position[0], n.position[2]))
    for (let i = 0; i < azimuths.length; i++) {
      for (let j = i + 1; j < azimuths.length; j++) {
        const d = Math.abs(azimuths[i] - azimuths[j])
        expect(Math.min(d, Math.PI * 2 - d)).toBeGreaterThan(0.3)
      }
    }
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

  it('linkedin panel carries the headline', () => {
    expect(nodeById('linkedin').lines).toEqual(['Bradley Handley', 'Cloud security leader'])
  })
})
