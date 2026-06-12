export interface NodeData {
  lines: string[]
}

export interface DataSource {
  id: string
  ttlMs: number
  fetchData(): Promise<NodeData>
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** localStorage when usable, otherwise an in-memory stand-in (BRA-54). */
export function safeStorage(): StorageLike {
  try {
    const probe = '__handleyio_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v)
      },
    }
  }
}

export function withCache(
  source: DataSource,
  storage: StorageLike = safeStorage(),
  now: () => number = Date.now,
): DataSource {
  const key = `nodedata:${source.id}`
  return {
    ...source,
    async fetchData() {
      try {
        const raw = storage.getItem(key)
        if (raw) {
          const entry = JSON.parse(raw) as { t: number; v: NodeData }
          if (now() - entry.t < source.ttlMs) return entry.v
        }
      } catch {
        // corrupt entry: fall through to a fresh fetch
      }
      const v = await source.fetchData()
      try {
        storage.setItem(key, JSON.stringify({ t: now(), v }))
      } catch {
        // Covers both permanently blocked storage and quota filling
        // mid-session; safeStorage()'s probe only checks at init time.
      }
      return v
    },
  }
}
