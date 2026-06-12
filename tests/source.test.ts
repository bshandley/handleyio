import { describe, expect, it, vi } from 'vitest'
import { withCache, safeStorage, type DataSource, type NodeData } from '../src/data/source'

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

function source(fetchData: () => Promise<NodeData>): DataSource {
  return { id: 'github', ttlMs: 1000, fetchData }
}

describe('withCache', () => {
  it('fetches on miss and stores the result', async () => {
    const fetchData = vi.fn(async () => ({ lines: ['a'] }))
    const storage = fakeStorage()
    const cached = withCache(source(fetchData), storage, () => 0)
    expect(await cached.fetchData()).toEqual({ lines: ['a'] })
    expect(await cached.fetchData()).toEqual({ lines: ['a'] })
    expect(fetchData).toHaveBeenCalledTimes(1)
  })

  it('refetches after ttl expiry', async () => {
    const fetchData = vi.fn(async () => ({ lines: ['a'] }))
    const storage = fakeStorage()
    let now = 0
    const cached = withCache(source(fetchData), storage, () => now)
    await cached.fetchData()
    now = 1001
    await cached.fetchData()
    expect(fetchData).toHaveBeenCalledTimes(2)
  })

  it('ignores corrupt cache entries', async () => {
    const storage = fakeStorage()
    storage.setItem('nodedata:github', '{not json')
    const cached = withCache(source(async () => ({ lines: ['a'] })), storage, () => 0)
    expect(await cached.fetchData()).toEqual({ lines: ['a'] })
  })
})

describe('withCache storage failures', () => {
  it('a setItem quota error still returns the fresh fetch', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const source = withCache(
      { id: 'x', ttlMs: 1000, fetchData: async () => ({ lines: ['fresh'] }) },
      storage,
      () => 0,
    )
    await expect(source.fetchData()).resolves.toEqual({ lines: ['fresh'] })
  })
})

describe('safeStorage', () => {
  it('falls back to in-memory storage when localStorage is unusable', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('blocked')
      },
      configurable: true,
    })
    try {
      const s = safeStorage()
      s.setItem('k', 'v')
      expect(s.getItem('k')).toBe('v')
      expect(s.getItem('missing')).toBeNull()
    } finally {
      if (orig) Object.defineProperty(globalThis, 'localStorage', orig)
      else delete (globalThis as Record<string, unknown>).localStorage
    }
  })
})
