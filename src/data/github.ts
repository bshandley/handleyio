import type { DataSource, NodeData } from './source'

const DAY = 86_400_000
const WINDOW_DAYS = 30
const BUCKETS = 10
const BLOCKS = '▁▂▃▄▅▆▇█'

interface GithubEvent {
  type: string
  created_at: string
  payload: { size?: number }
}

export function timeAgo(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / DAY)}d ago`
}

export function parseGithubEvents(events: unknown[], now: number): NodeData {
  const windowMs = WINDOW_DAYS * DAY
  const pushes = (events as GithubEvent[]).filter(
    (e) =>
      e?.type === 'PushEvent' &&
      typeof e.created_at === 'string' &&
      now - Date.parse(e.created_at) < windowMs,
  )

  const buckets = new Array<number>(BUCKETS).fill(0)
  let total = 0
  let newest = -Infinity
  for (const e of pushes) {
    const t = Date.parse(e.created_at)
    const commits = e.payload?.size ?? 0
    total += commits
    newest = Math.max(newest, t)
    const age = now - t
    const bucket = BUCKETS - 1 - Math.min(BUCKETS - 1, Math.floor(age / (windowMs / BUCKETS)))
    buckets[bucket] += commits
  }

  const peak = Math.max(1, ...buckets)
  const spark = buckets
    .map((c) => BLOCKS[c === 0 ? 0 : Math.min(7, 1 + Math.floor((c / peak) * 6.999))])
    .join('')

  return {
    lines: [
      `${spark} ${total} commits · ${WINDOW_DAYS}d`,
      pushes.length ? `last push: ${timeAgo(now - newest)}` : 'last push: n/a',
    ],
  }
}

export const githubSource: DataSource = {
  id: 'github',
  ttlMs: 3_600_000,
  async fetchData() {
    const res = await fetch('https://api.github.com/users/bshandley/events/public?per_page=100', {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`github api ${res.status}`)
    return parseGithubEvents(await res.json(), Date.now())
  },
}
