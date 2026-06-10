import { describe, expect, it } from 'vitest'
import { parseGithubEvents, timeAgo } from '../src/data/github'

const DAY = 86_400_000
const NOW = 1_750_000_000_000

// The unauthenticated public events API strips size/commits from PushEvent
// payloads, so the fixture mirrors that slim shape.
function pushEvent(agoMs: number) {
  return {
    type: 'PushEvent',
    created_at: new Date(NOW - agoMs).toISOString(),
    payload: { push_id: 1, ref: 'refs/heads/main' },
  }
}

describe('parseGithubEvents', () => {
  it('counts PushEvents in the last 30 days', () => {
    const events = [
      pushEvent(1 * DAY),
      pushEvent(10 * DAY),
      pushEvent(40 * DAY),
      { type: 'WatchEvent', created_at: new Date(NOW).toISOString(), payload: {} },
    ]
    const data = parseGithubEvents(events, NOW)
    expect(data.lines[0]).toContain('2 pushes')
    expect(data.lines[0]).toContain('30d')
  })

  it('renders a 10-bucket sparkline, oldest first', () => {
    const events = [pushEvent(1 * DAY)]
    const data = parseGithubEvents(events, NOW)
    const spark = data.lines[0].split(' ')[0]
    expect(spark).toHaveLength(10)
    expect(spark[9]).toBe('█')
    expect(spark[0]).toBe('▁')
  })

  it('uses the singular for one push', () => {
    const data = parseGithubEvents([pushEvent(1 * DAY)], NOW)
    expect(data.lines[0]).toContain('1 push ·')
  })

  it('reports last push time', () => {
    const data = parseGithubEvents([pushEvent(2 * 3_600_000)], NOW)
    expect(data.lines[1]).toBe('last push: 2h ago')
  })

  it('handles zero events', () => {
    const data = parseGithubEvents([], NOW)
    expect(data.lines[0]).toContain('0 pushes')
    expect(data.lines[1]).toBe('last push: n/a')
  })

  it('clamps future-dated events into the newest bucket', () => {
    const data = parseGithubEvents([pushEvent(-60_000)], NOW)
    const spark = data.lines[0].split(' ')[0]
    expect(spark).toHaveLength(10)
    expect(spark[9]).toBe('█')
  })
})

describe('timeAgo', () => {
  it('formats minutes, hours, days', () => {
    expect(timeAgo(5 * 60_000)).toBe('5m ago')
    expect(timeAgo(3 * 3_600_000)).toBe('3h ago')
    expect(timeAgo(2 * DAY)).toBe('2d ago')
  })
})
