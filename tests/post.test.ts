import { describe, expect, it } from 'vitest'
import { finishShader, hdrSupported } from '../src/render/post'

describe('hdrSupported', () => {
  it('is false without float color buffers', () => {
    expect(hdrSupported(() => false)).toBe(false)
  })
  it('is true with either float extension', () => {
    expect(hdrSupported((n) => n === 'EXT_color_buffer_float')).toBe(true)
    expect(hdrSupported((n) => n === 'EXT_color_buffer_half_float')).toBe(true)
  })
})

describe('finishShader', () => {
  it('samples tDiffuse and exposes the vignette uniform', () => {
    expect(finishShader.uniforms.uVignette.value).toBeGreaterThan(0)
    expect(finishShader.fragmentShader).toContain('tDiffuse')
  })
})
