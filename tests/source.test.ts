import { describe, expect, it, vi } from 'vitest'
import { withCache, type DataSource, type NodeData } from '../src/data/source'

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
