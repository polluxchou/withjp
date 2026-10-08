// src/lib/competitors/cadence.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGING_DAYS, FRESH_DAYS, WEEKLY_MAX_DAYS,
  daysSince, daysSincePrevious, freshnessOf, intervalDelta, isoDateInTimeZone, latestDelta, windowChange,
} from './cadence.ts'

const p = (captured_on: string | null, followers: number | null) => ({ captured_on, followers })

test('intervalDelta: 间隔 ≤ 8 天按周写，不给折算', () => {
  assert.deepEqual(intervalDelta(p('2026-09-07', 20500), p('2026-09-15', 20900)), { pct: 2, days: 8, perWeekPct: null })
  assert.equal(WEEKLY_MAX_DAYS, 8)
})

test('intervalDelta: 间隔 > 8 天写真实天数，并按复利匀速折算每周', () => {
  // 1MB Twinkle 9/07 → 9/16：20500 → 20900，9 天
  assert.deepEqual(intervalDelta(p('2026-09-07', 20500), p('2026-09-16', 20900)), { pct: 2, days: 9, perWeekPct: 1.5 })
  // 22 天 +4.8%：(1.0478)^(7/22) - 1 ≈ 1.5%
  const d = intervalDelta(p('2026-09-16', 20900), p('2026-10-08', 21900))
  assert.equal(d?.days, 22)
  assert.equal(d?.pct, 4.8)
  assert.equal(d?.perWeekPct, 1.5)
})

test('intervalDelta: 下跌也照算，折算值为负', () => {
  const d = intervalDelta(p('2026-09-01', 10000), p('2026-09-15', 9000))
  assert.equal(d?.pct, -10)
  assert.ok((d?.perWeekPct ?? 0) < 0)
})

test('intervalDelta: 基数为 0、同一天、日期倒置、缺值都给 null', () => {
  assert.equal(intervalDelta(p('2026-09-01', 0), p('2026-09-08', 10)), null)
  assert.equal(intervalDelta(p('2026-09-08', 10), p('2026-09-08', 12)), null)
  assert.equal(intervalDelta(p('2026-09-08', 10), p('2026-09-01', 12)), null)
  assert.equal(intervalDelta(p(null, 10), p('2026-09-08', 12)), null)
  assert.equal(intervalDelta(p('2026-09-01', 10), p('2026-09-08', null)), null)
})

test('latestDelta: 跨缺采的周取最近两个真点，不再因为上一周缺采就不给', () => {
  const slots = [p('2026-09-07', 20500), p('2026-09-16', 20900), p(null, null), p(null, null), p('2026-10-08', 21900)]
  assert.deepEqual(latestDelta(slots), { pct: 4.8, days: 22, perWeekPct: 1.5 })
})

test('latestDelta: 不足两个真点给 null', () => {
  assert.equal(latestDelta([p('2026-09-16', 20900), p(null, null)]), null)
  assert.equal(latestDelta([]), null)
})

test('windowChange: 首末格都有数才给，天数按真实采集日', () => {
  const slots = [p('2026-08-17', 19500), p('2026-08-24', 20000), p(null, null), p('2026-09-07', 20500), p('2026-09-16', 20900)]
  assert.deepEqual(windowChange(slots), { pct: 7.2, days: 30, from: '2026-08-17', to: '2026-09-16' })
})

test('windowChange: 首格或末格缺采就不给（换起点区间就不是一个月了）', () => {
  assert.equal(windowChange([p(null, null), p('2026-08-24', 20000), p('2026-09-16', 20900)]), null)
  assert.equal(windowChange([p('2026-08-17', 19500), p('2026-08-24', 20000), p(null, null)]), null)
  assert.equal(windowChange([p('2026-08-17', 19500)]), null)
})

test('daysSincePrevious: 每个采集日对上一次的间隔，输入乱序也按日期排', () => {
  const m = daysSincePrevious([p('2026-08-10', 19000), p('2026-07-29', 18500), p(null, null), p('2026-08-17', 19500)])
  assert.deepEqual(m.get('2026-08-10'), { days: 12, prev: '2026-07-29' })
  assert.deepEqual(m.get('2026-08-17'), { days: 7, prev: '2026-08-10' })
  assert.equal(m.has('2026-07-29'), false)
})

test('daysSince: 距今天数；未来日期按 0；非法日期给 null', () => {
  assert.equal(daysSince('2026-09-16', '2026-10-08'), 22)
  assert.equal(daysSince('2026-10-09', '2026-10-08'), 0)
  assert.equal(daysSince(null, '2026-10-08'), null)
  assert.equal(daysSince('2026-09-16', null), null)
  assert.equal(daysSince('9/16', '2026-10-08'), null)
})

test('isoDateInTimeZone: UTC 前一天 20:00 在东京已是第二天', () => {
  const now = new Date('2026-10-07T20:00:00Z')
  assert.equal(isoDateInTimeZone(now, 'Asia/Tokyo'), '2026-10-08')
  assert.equal(isoDateInTimeZone(now, 'UTC'), '2026-10-07')
})

test('freshnessOf: 7 天内正常、8–14 天提醒、再久待更新（边界含在前一档）', () => {
  assert.equal(FRESH_DAYS, 7)
  assert.equal(AGING_DAYS, 14)
  assert.equal(freshnessOf(0), 'fresh')
  assert.equal(freshnessOf(7), 'fresh')
  assert.equal(freshnessOf(8), 'aging')
  assert.equal(freshnessOf(14), 'aging')
  assert.equal(freshnessOf(15), 'stale')
})
