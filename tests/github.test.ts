import { describe, expect, it } from 'vitest'
import { parseGithubEvents, timeAgo } from '../src/data/github'

const DAY = 86_400_000
const NOW = 1_750_000_000_000

function pushEvent(agoMs: number, commits: number) {
  return {
    type: 'PushEvent',
    created_at: new Date(NOW - agoMs).toISOString(),
    payload: { size: commits },
  }
}

describe('parseGithubEvents', () => {
  it('sums commits from PushEvents in the last 30 days', () => {
    const events = [
      pushEvent(1 * DAY, 3),
      pushEvent(10 * DAY, 2),
      pushEvent(40 * DAY, 99),
      { type: 'WatchEvent', created_at: new Date(NOW).toISOString(), payload: {} },
    ]
    const data = parseGithubEvents(events, NOW)
    expect(data.lines[0]).toContain('5 commits')
    expect(data.lines[0]).toContain('30d')
  })

  it('renders a 10-bucket sparkline, oldest first', () => {
    const events = [pushEvent(1 * DAY, 4)]
    const data = parseGithubEvents(events, NOW)
    const spark = data.lines[0].split(' ')[0]
    expect(spark).toHaveLength(10)
    expect(spark[9]).toBe('█')
    expect(spark[0]).toBe('▁')
  })

  it('reports last push time', () => {
    const data = parseGithubEvents([pushEvent(2 * 3_600_000, 1)], NOW)
    expect(data.lines[1]).toBe('last push: 2h ago')
  })

  it('handles zero events', () => {
    const data = parseGithubEvents([], NOW)
    expect(data.lines[0]).toContain('0 commits')
    expect(data.lines[1]).toBe('last push: n/a')
  })

  it('clamps future-dated events into the newest bucket', () => {
    const data = parseGithubEvents([pushEvent(-60_000, 2)], NOW)
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
