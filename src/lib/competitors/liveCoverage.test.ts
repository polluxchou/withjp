// 仓库是 public：夹具一律是合成数据，不放任何真实竞品的名字或 handle。
import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveSpan } from './liveSessions.ts'
import { locateSpans } from './liveStats.ts'
import { coverageOf, patrolDaysOf } from './liveCoverage.ts'

const TZ = 'Asia/Tokyo'
const j = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString()
const span = (ymd: string, source: LiveSpan['source'] = 'history'): LiveSpan => ({
  startedAt: j(ymd, '12:00'), endedAt: j(ymd, '14:00'), approxEnd: source === 'shot', likes: null, title: '', source,
})

test('patrolDaysOf: 去重，丢掉空值', () => {
  const days = patrolDaysOf(['2026-09-01', null, '2026-09-01', undefined, '', '2026-09-03'])
  assert.deepEqual(Array.from(days).sort(), ['2026-09-01', '2026-09-03'])
})

test('coverageOf: 导入场次的首末日期之间（两端都含）算有数据，哪怕当天没播', () => {
  const located = locateSpans([span('2026-09-05'), span('2026-09-10')], TZ)
  const has = coverageOf(located, new Set())
  assert.equal(has('2026-09-05'), true)
  assert.equal(has('2026-09-07'), true, '区间内没播的日子 = 没播，而不是无数据')
  assert.equal(has('2026-09-10'), true)
  assert.equal(has('2026-09-04'), false)
  assert.equal(has('2026-09-11'), false)
})

test('coverageOf: 导入区间之外回落到巡检日', () => {
  const located = locateSpans([span('2026-09-05'), span('2026-09-10')], TZ)
  const has = coverageOf(located, new Set(['2026-09-01', '2026-09-12']))
  assert.equal(has('2026-09-01'), true)
  assert.equal(has('2026-09-02'), false)
  assert.equal(has('2026-09-12'), true)
})

test('coverageOf: 只有截图的号只看巡检日，截图场次本身不撑出一个区间', () => {
  const located = locateSpans([span('2026-09-01', 'shot'), span('2026-09-20', 'shot')], TZ)
  const has = coverageOf(located, new Set(['2026-09-01', '2026-09-20']))
  assert.equal(has('2026-09-01'), true)
  assert.equal(has('2026-09-10'), false, '两张截图之间巡检没跑过的日子是无数据')
  assert.equal(has('2026-09-20'), true)
})

test('coverageOf: 没有导入也没有巡检日时，哪天都算无数据', () => {
  const has = coverageOf([], new Set())
  assert.equal(has('2026-09-01'), false)
  assert.equal(has('1970-01-01'), false)
})
