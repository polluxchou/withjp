// 仓库是 public：夹具一律是合成数据，不放任何真实竞品的名字或 handle。
import assert from 'node:assert/strict'
import test from 'node:test'
import type { LiveSpan } from './liveSessions.ts'
import { locateSpans } from './liveStats.ts'
import { coverageOf, patrolDaysOf, patrolDaysOfBoard } from './liveCoverage.ts'
import { UNDATED_KEY } from './shotGrid.ts'

const TZ = 'Asia/Tokyo'
const j = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`).toISOString()
const span = (ymd: string, source: LiveSpan['source'] = 'history'): LiveSpan => ({
  startedAt: j(ymd, '12:00'), endedAt: j(ymd, '14:00'), approxEnd: source === 'shot', likes: null, title: '', source,
})

test('patrolDaysOf: 去重，丢掉空值', () => {
  const days = patrolDaysOf(['2026-09-01', null, '2026-09-01', undefined, '', '2026-09-03'])
  assert.deepEqual(Array.from(days).sort(), ['2026-09-01', '2026-09-03'])
})

test('patrolDaysOfBoard: 巡检日 = 看板完整日期轴 shotAxis 上的有图日期，剔掉无日期占位', () => {
  const days = patrolDaysOfBoard({ shotAxis: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-09', UNDATED_KEY] })
  assert.deepEqual(Array.from(days).sort(), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-09'])
  assert.equal(days.has(UNDATED_KEY), false)
  assert.equal(patrolDaysOfBoard({ shotAxis: [] }).size, 0)
  assert.equal(patrolDaysOfBoard({ shotAxis: [UNDATED_KEY] }).size, 0, '只有无日期截图时没有巡检日')
})

test('patrolDaysOfBoard: 只读 shotAxis，不读各号已加载的截图（相册窗口外的日期照样算巡检日）', () => {
  // 结构上就是一块看板：competitors 里的 shots 只是相册已加载的那一段（这里只剩 09-09），轴是全量。
  const board = {
    shotAxis: ['2026-08-01', '2026-08-15', '2026-09-09'],
    competitors: [{ shots: [{ shot_on: '2026-09-09' }, { shot_on: '2026-07-01' }], related: [] }],
  }
  assert.deepEqual(Array.from(patrolDaysOfBoard(board)).sort(), ['2026-08-01', '2026-08-15', '2026-09-09'])
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
