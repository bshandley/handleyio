import { describe, expect, it } from 'vitest'
import { TAG_MAX_WIDTH, tagFor, tagVisible } from '../src/hud/tags'

describe('beacon tags', () => {
  it('uses the explicit tag, else the designation head', () => {
    expect(tagFor({ tag: 'GH-01', designation: 'NODE 01 · GH-SECTOR' })).toBe('GH-01')
    expect(tagFor({ designation: 'NODE 02 · COMMS-RELAY' })).toBe('NODE 02')
  })

  it('hides while that node panel is open, off screen, or at phone widths', () => {
    const base = { id: 'github', openId: null, onScreen: true, width: 1600 }
    expect(tagVisible(base)).toBe(true)
    expect(tagVisible({ ...base, openId: 'github' })).toBe(false)
    expect(tagVisible({ ...base, openId: 'email' })).toBe(true)
    expect(tagVisible({ ...base, onScreen: false })).toBe(false)
    expect(tagVisible({ ...base, width: TAG_MAX_WIDTH })).toBe(false)
    expect(tagVisible({ ...base, width: TAG_MAX_WIDTH + 1 })).toBe(true)
  })
})
