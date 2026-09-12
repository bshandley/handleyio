import { describe, expect, it } from 'vitest'
import { finishShader, hdrSupported } from '../src/render/post'
import { parseExposureParam, parseToneParam, TONE_MAPPER } from '../src/render/post'

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

describe('tone pin', () => {
  it('parses the tone mapper name and ignores anything else', () => {
    expect(parseToneParam('?tone=neutral')).toBe('neutral')
    expect(parseToneParam('?tone=agx')).toBe('agx')
    expect(parseToneParam('?tone=filmic')).toBeNull()
    expect(parseToneParam('')).toBeNull()
  })

  it('parses a finite positive exposure', () => {
    expect(parseExposureParam('?exposure=1.2')).toBe(1.2)
    expect(parseExposureParam('?exposure=0')).toBeNull()
    expect(parseExposureParam('?exposure=abc')).toBeNull()
    expect(parseExposureParam('?level=0')).toBeNull()
  })

  it('ships one of the two mappers', () => {
    expect(['agx', 'neutral']).toContain(TONE_MAPPER)
  })
})
