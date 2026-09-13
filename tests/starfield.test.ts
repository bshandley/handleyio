import { describe, expect, it } from 'vitest'
import { createStarfield, generateStarfield } from '../src/galaxy/starfield'
import { RENDER_ORDER } from '../src/galaxy/order'
import { mulberry } from './rng'

describe('generateStarfield', () => {
  const s = generateStarfield(1000, 20, mulberry(4))

  it('places every star on the far shell', () => {
    for (let i = 0; i < 1000; i++) {
      const r = Math.hypot(s.position[i * 3], s.position[i * 3 + 1], s.position[i * 3 + 2])
      expect(r).toBeGreaterThanOrEqual(40)
      expect(r).toBeLessThanOrEqual(60)
    }
  })

  it('flags exactly brightCount spiked stars, larger than the rest', () => {
    let spiked = 0
    let minBright = Infinity
    let maxDim = 0
    for (let i = 0; i < 1000; i++) {
      if (s.spike[i] === 1) {
        spiked++
        minBright = Math.min(minBright, s.size[i])
      } else {
        maxDim = Math.max(maxDim, s.size[i])
      }
    }
    expect(spiked).toBe(20)
    expect(minBright).toBeGreaterThan(maxDim)
  })

  it('mixes temperatures: some orange, some blue-white, colors in range', () => {
    let orange = 0
    let blue = 0
    for (let i = 0; i < 1000; i++) {
      const [r, g, b] = [s.color[i * 3], s.color[i * 3 + 1], s.color[i * 3 + 2]]
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
      if (r > b + 0.2) orange++
      if (b > r + 0.1) blue++
    }
    expect(orange).toBeGreaterThan(50)
    expect(blue).toBeGreaterThan(100)
  })
})

describe('createStarfield', () => {
  it('builds background points and scales with pixel ratio', () => {
    const sf = createStarfield(2, 500, 10, mulberry(1))
    expect(sf.points.renderOrder).toBe(RENDER_ORDER.background)
    expect(sf.points.material.uniforms.uPixelRatio.value).toBe(2)
    sf.setPixelRatio(1.5)
    expect(sf.points.material.uniforms.uPixelRatio.value).toBe(1.5)
    sf.dispose()
  })
})
