import test from 'node:test'
import assert from 'node:assert/strict'

import { formatDayStamp } from './dayStamp.ts'

// 这些断言只有在运行时区不是 UTC 时才有意义 —— CI 与本机都可能是任意时区,
// 所以这里显式把进程时区钉在 UTC 以西的一个区上再断言。
process.env.TZ = 'America/Los_Angeles'

test('UTC 日戳按日历字段渲染，UTC 以西的时区不再整体差一天', () => {
  assert.equal(formatDayStamp('2026-08-31T00:00:00.000Z'), 'Aug 31, 2026')
  assert.equal(formatDayStamp('2026-01-01T00:00:00.000Z'), 'Jan 1, 2026')
})

test('对照组：直接用本地时区渲染同一个值会退一天', () => {
  const naive = new Date('2026-08-31T00:00:00.000Z')
  assert.equal(naive.getDate(), 30, '前提失效：进程时区不在 UTC 以西')
})

test('自定义 pattern 与缺失值', () => {
  assert.equal(formatDayStamp('2026-08-31T00:00:00.000Z', 'MMM d'), 'Aug 31')
  assert.equal(formatDayStamp(null), '—')
  assert.equal(formatDayStamp(''), '—')
  assert.equal(formatDayStamp('nope'), '—')
})
