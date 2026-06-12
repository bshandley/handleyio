import { describe, expect, it } from 'vitest'
import { HINT_DELAY_S, HINT_KEY, HintModel } from '../src/hud/hint'

function memStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
  }
}

describe('HintModel', () => {
  it('is pending at start and shows after the delay', () => {
    const h = new HintModel(memStorage())
    expect(h.state()).toBe('pending')
    h.tick(HINT_DELAY_S - 0.1)
    expect(h.state()).toBe('pending')
    h.tick(0.2)
    expect(h.state()).toBe('visible')
  })

  it('never shows when the flag is set', () => {
    const h = new HintModel(memStorage({ [HINT_KEY]: '1' }))
    h.tick(HINT_DELAY_S * 10)
    expect(h.state()).toBe('done')
  })

  it('interaction dismisses and persists the flag', () => {
    const storage = memStorage()
    const h = new HintModel(storage)
    h.tick(HINT_DELAY_S + 1)
    h.interact()
    expect(h.state()).toBe('done')
    expect(storage.getItem(HINT_KEY)).toBe('1')
  })

  it('interaction before the delay suppresses the hint entirely', () => {
    const h = new HintModel(memStorage())
    h.interact()
    h.tick(HINT_DELAY_S * 10)
    expect(h.state()).toBe('done')
  })

  it('survives a throwing storage (shows every visit instead)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const h = new HintModel(throwing)
    h.tick(HINT_DELAY_S + 1)
    expect(h.state()).toBe('visible')
    h.interact()
    expect(h.state()).toBe('done')
  })
})
