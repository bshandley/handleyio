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

export function withCache(
  source: DataSource,
  storage: StorageLike = localStorage,
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
      storage.setItem(key, JSON.stringify({ t: now(), v }))
      return v
    },
  }
}
