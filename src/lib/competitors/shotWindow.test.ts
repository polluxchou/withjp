// src/lib/competitors/shotWindow.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNDATED_KEY } from './shotGrid.ts'
import {
  SHOT_CHUNK_DAYS, boardRefreshPath, buildShotIndex, initialLoadedFrom, loadedRangeOrFilter,
  parseShotRangeQuery, parseSinceQuery, resolveLoadedFrom, shotRangePath,
} from './shotWindow.ts'

const row = (competitor_id: string, shot_on: string | null, stream_started_at: string | null = null) =>
  ({ competitor_id, shot_on, stream_started_at })

test('buildShotIndex: 日期轴跨账号去重并升序', () => {
  const { shotAxis } = buildShotIndex([
    row('a', '2026-08-05'), row('a', '2026-08-03'), row('b', '2026-08-05'), row('b', '2026-08-01'),
  ])
  assert.deepEqual(shotAxis, ['2026-08-01', '2026-08-03', '2026-08-05'])
})

test('buildShotIndex: 有无日期截图时轴尾追加 UNDATED_KEY', () => {
  assert.deepEqual(buildShotIndex([row('a', '2026-08-05'), row('a', null)]).shotAxis, ['2026-08-05', UNDATED_KEY])
  assert.deepEqual(buildShotIndex([row('a', null)]).shotAxis, [UNDATED_KEY])
})

test('buildShotIndex: 空表', () => {
  const idx = buildShotIndex([])
  assert.deepEqual(idx.shotAxis, [])
  assert.equal(idx.sessionStartsBy.size, 0)
})

test('buildShotIndex: 开播时刻按账号去重、忽略空值、升序', () => {
  const idx = buildShotIndex([
    row('a', '2026-08-05', '2026-08-05T05:00:00+00:00'),
    row('a', '2026-08-05', '2026-08-05T05:00:00+00:00'), // 同一场的第二张截图
    row('a', '2026-08-03', '2026-08-03T04:30:00+00:00'),
    row('a', '2026-08-04', null),
    row('b', '2026-08-05', '2026-08-05T05:00:00+00:00'), // 另一个号凑巧同一秒开播，不能被并掉
  ])
  assert.deepEqual(idx.sessionStartsBy.get('a'), ['2026-08-03T04:30:00+00:00', '2026-08-05T05:00:00+00:00'])
  assert.deepEqual(idx.sessionStartsBy.get('b'), ['2026-08-05T05:00:00+00:00'])
})

test('buildShotIndex: 只有无开播时刻截图的账号不进 sessionStartsBy', () => {
  assert.equal(buildShotIndex([row('a', '2026-08-05')]).sessionStartsBy.has('a'), false)
})

test('buildShotIndex: 无日期截图的开播时刻照样记入该账号，日期轴仍追加 UNDATED_KEY', () => {
  const idx = buildShotIndex([
    row('a', null, '2026-08-02T05:00:00+00:00'),
    row('a', '2026-08-05', '2026-08-05T05:00:00+00:00'),
  ])
  assert.deepEqual(idx.sessionStartsBy.get('a'), ['2026-08-02T05:00:00+00:00', '2026-08-05T05:00:00+00:00'])
  assert.deepEqual(idx.shotAxis, ['2026-08-05', UNDATED_KEY])
  // 只有无日期截图的账号同样不能丢开播时刻
  const only = buildShotIndex([row('b', null, '2026-08-03T04:00:00+00:00')])
  assert.deepEqual(only.sessionStartsBy.get('b'), ['2026-08-03T04:00:00+00:00'])
  assert.deepEqual(only.shotAxis, [UNDATED_KEY])
})

/** 2026-08-01 起连续 n 天的日期轴。 */
function axisOf(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
}

test('SHOT_CHUNK_DAYS: 一段 10 个有图日（两屏）', () => {
  assert.equal(SHOT_CHUNK_DAYS, 10)
})

test('initialLoadedFrom: 有图日不超过一段时全取（null）', () => {
  assert.equal(initialLoadedFrom([]), null)
  assert.equal(initialLoadedFrom(axisOf(10)), null)
})

test('initialLoadedFrom: 超过一段时取倒数第 10 个有图日', () => {
  assert.equal(initialLoadedFrom(axisOf(11)), '2026-08-02')
  assert.equal(initialLoadedFrom(axisOf(25)), '2026-08-16')
})

test('initialLoadedFrom: 轴尾的 UNDATED_KEY 不算一天', () => {
  assert.equal(initialLoadedFrom([...axisOf(10), UNDATED_KEY]), null)
  assert.equal(initialLoadedFrom([...axisOf(11), UNDATED_KEY]), '2026-08-02')
})

test('resolveLoadedFrom: 不带 since 就是首屏默认起点', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), null), '2026-08-16')
})

test('resolveLoadedFrom: since 更早时用 since（刷新保住已翻到的范围）', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-08-05'), '2026-08-05')
})

test('resolveLoadedFrom: since 比默认起点还晚时仍至少盖住默认两屏', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-08-20'), '2026-08-16')
})

test('resolveLoadedFrom: 起点早于或等于轴首时归一成 null（全部）', () => {
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-08-01'), null)
  assert.equal(resolveLoadedFrom(axisOf(25), '2026-07-01'), null)
})

test('resolveLoadedFrom: 轴不足一段时不管 since 都是 null', () => {
  assert.equal(resolveLoadedFrom(axisOf(8), '2026-08-05'), null)
})

test('loadedRangeOrFilter: 已加载 = 不早于起点或无日期', () => {
  assert.equal(loadedRangeOrFilter('2026-08-16'), 'shot_on.gte.2026-08-16,shot_on.is.null')
})

test('loadedRangeOrFilter: null（全部）给恒真式', () => {
  assert.equal(loadedRangeOrFilter(null), 'shot_on.is.null,shot_on.not.is.null')
})

test('parseSinceQuery: 缺省为 null，合法日期原样返回', () => {
  assert.deepEqual(parseSinceQuery(null), { ok: true, since: null })
  assert.deepEqual(parseSinceQuery('2026-08-16'), { ok: true, since: '2026-08-16' })
})

test('parseSinceQuery: 空串、假日期、带注入的串一律拒绝', () => {
  assert.deepEqual(parseSinceQuery(''), { ok: false })
  assert.deepEqual(parseSinceQuery('2026-02-30'), { ok: false })
  assert.deepEqual(parseSinceQuery('2026-08-16,id.gt.0'), { ok: false })
})

test('parseShotRangeQuery: 合法区间', () => {
  assert.deepEqual(parseShotRangeQuery('2026-08-01', '2026-08-16'), { ok: true, from: '2026-08-01', before: '2026-08-16' })
})

test('parseShotRangeQuery: 缺参数、假日期、空区间、倒置区间一律拒绝', () => {
  assert.deepEqual(parseShotRangeQuery(null, '2026-08-16'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-01', null), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-02-30', '2026-08-16'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-01', '2026-04-31'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-16', '2026-08-16'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-17', '2026-08-16'), { ok: false })
})

test('boardRefreshPath / shotRangePath', () => {
  assert.equal(boardRefreshPath(null), '/api/competitors')
  assert.equal(boardRefreshPath('2026-08-16'), '/api/competitors?since=2026-08-16')
  assert.equal(shotRangePath({ from: '2026-08-01', before: '2026-08-16' }), '/api/competitors/shots?from=2026-08-01&before=2026-08-16')
})
