// src/lib/competitors/summary.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { STALE_DAYS, competitorName, summarizeBoard } from './summary.ts'
import type { SummaryInput } from './summary.ts'

function make(
  handle: string,
  latest: SummaryInput['latest'],
  display_name: string | null = null,
): SummaryInput {
  return { handle, display_name, latest }
}

function snap(captured_on: string, followers: number | null, display_name: string | null = null) {
  return { captured_on, followers, display_name }
}

test('summarizeBoard: 空数组归零', () => {
  const s = summarizeBoard([], '2026-08-15')
  assert.deepEqual(s, {
    tracked: 0,
    withData: 0,
    totalFollowers: 0,
    latestCapturedOn: null,
    latestMetricsOn: null,
    latestShotOn: null,
    daysSinceLatest: null,
    staleCount: 0,
    staleNames: [],
  })
})

test('summarizeBoard: 全部有数据时求和且 withData 等于 tracked', () => {
  const s = summarizeBoard(
    [
      make('a', snap('2026-08-15', 1000)),
      make('b', snap('2026-08-14', 2500)),
    ],
    '2026-08-15',
  )
  assert.equal(s.tracked, 2)
  assert.equal(s.withData, 2)
  assert.equal(s.totalFollowers, 3500)
  assert.equal(s.staleCount, 0)
})

test('summarizeBoard: followers 为 null 的账号跳过求和但仍算已追踪', () => {
  const s = summarizeBoard(
    [
      make('a', snap('2026-08-15', 1000)),
      make('b', snap('2026-08-15', null)),
    ],
    '2026-08-15',
  )
  assert.equal(s.tracked, 2)
  assert.equal(s.withData, 1)
  assert.equal(s.totalFollowers, 1000)
  // 有快照、日期是今天 —— 只是没抓到粉丝数，不算陈旧
  assert.equal(s.staleCount, 0)
})

test('summarizeBoard: 从未采集过的账号计入陈旧且不影响 latestCapturedOn', () => {
  const s = summarizeBoard(
    [
      make('a', snap('2026-08-15', 1000)),
      make('b', null, '没数据的团'),
    ],
    '2026-08-15',
  )
  assert.equal(s.withData, 1)
  assert.equal(s.latestCapturedOn, '2026-08-15')
  assert.equal(s.staleCount, 1)
  assert.deepEqual(s.staleNames, ['没数据的团'])
})

test('summarizeBoard: latestCapturedOn 取最大值（输入乱序）', () => {
  const s = summarizeBoard(
    [
      make('a', snap('2026-08-09', 1)),
      make('b', snap('2026-08-14', 2)),
      make('c', snap('2026-08-11', 3)),
    ],
    '2026-08-15',
  )
  assert.equal(s.latestCapturedOn, '2026-08-14')
  assert.equal(s.daysSinceLatest, 1)
})

test('summarizeBoard: 陈旧边界 —— 正好 7 天不算，8 天算', () => {
  const today = '2026-08-15'
  const exactly = summarizeBoard([make('a', snap('2026-08-08', 1))], today)
  assert.equal(exactly.staleCount, 0, `距今正好 ${STALE_DAYS} 天不应算陈旧`)

  const beyond = summarizeBoard([make('a', snap('2026-08-07', 1))], today)
  assert.equal(beyond.staleCount, 1)
})

test('summarizeBoard: 跨年日期差按 UTC 整天计算', () => {
  const s = summarizeBoard([make('a', snap('2025-12-30', 1))], '2026-01-01')
  assert.equal(s.daysSinceLatest, 2)
  assert.equal(s.staleCount, 0)
})

test('summarizeBoard: staleNames 保持输入顺序', () => {
  const s = summarizeBoard(
    [
      make('zzz', snap('2026-01-01', 1)),
      make('aaa', snap('2026-08-15', 1)),
      make('mmm', null),
    ],
    '2026-08-15',
  )
  assert.deepEqual(s.staleNames, ['zzz', 'mmm'])
})

test('competitorName: 快照名 → 竞品名 → handle 三级回退', () => {
  assert.equal(competitorName(make('handle', snap('2026-08-15', 1, '快照名'), '竞品名')), '快照名')
  assert.equal(competitorName(make('handle', snap('2026-08-15', 1, null), '竞品名')), '竞品名')
  assert.equal(competitorName(make('handle', null, null)), 'handle')
})

// —— 「最近采集」跨两条链路：主页指标快照 + 直播截图 ——

function shot(shot_on: string | null) {
  return { shot_on }
}

test('summarizeBoard: 截图比指标新时，latestCapturedOn 取截图日、latestMetricsOn 留在指标日', () => {
  const s = summarizeBoard(
    [{ ...make('a', snap('2026-08-17', 1000)), shots: [shot('2026-08-18')] }],
    '2026-08-18',
  )
  assert.equal(s.latestCapturedOn, '2026-08-18')
  assert.equal(s.latestMetricsOn, '2026-08-17')
  assert.equal(s.latestShotOn, '2026-08-18')
  assert.equal(s.daysSinceLatest, 0)
})

test('summarizeBoard: 指标比截图新时截图不拉低日期', () => {
  const s = summarizeBoard(
    [{ ...make('a', snap('2026-08-18', 1000)), shots: [shot('2026-08-12'), shot('2026-08-15')] }],
    '2026-08-18',
  )
  assert.equal(s.latestCapturedOn, '2026-08-18')
  assert.equal(s.latestShotOn, '2026-08-15')
})

test('summarizeBoard: 未标日期的截图(shot_on=null)不参与', () => {
  const s = summarizeBoard(
    [{ ...make('a', snap('2026-08-17', 1000)), shots: [shot(null)] }],
    '2026-08-18',
  )
  assert.equal(s.latestShotOn, null)
  assert.equal(s.latestCapturedOn, '2026-08-17')
})

test('summarizeBoard: 子主播的截图也算进最近采集', () => {
  const s = summarizeBoard(
    [{
      ...make('parent', snap('2026-08-17', 1000)),
      shots: [],
      related: [{ ...make('kid', null), shots: [shot('2026-08-18')] }],
    }],
    '2026-08-18',
  )
  // 日期取最大值，不像账号数/粉丝总量那样会被子账号稀释，所以下钻的截图照算
  assert.equal(s.latestCapturedOn, '2026-08-18')
  assert.equal(s.tracked, 1, '追踪账号数仍只数顶层')
})

test('summarizeBoard: 只有截图没有指标时，日期出得来但账号仍算待更新', () => {
  const s = summarizeBoard(
    [{ ...make('a', null, '只截了图的团'), shots: [shot('2026-08-18')] }],
    '2026-08-18',
  )
  assert.equal(s.latestCapturedOn, '2026-08-18')
  assert.equal(s.latestMetricsOn, null)
  assert.equal(s.staleCount, 1)
  assert.deepEqual(s.staleNames, ['只截了图的团'])
})

test('summarizeBoard: 陈旧判定只看指标，截图再新也不救', () => {
  const s = summarizeBoard(
    [{ ...make('a', snap('2026-08-01', 1000)), shots: [shot('2026-08-18')] }],
    '2026-08-18',
  )
  assert.equal(s.staleCount, 1)
})
