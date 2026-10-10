// src/lib/competitors/shotWindow.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNDATED_KEY } from './shotGrid.ts'
import {
  SHOT_CHUNK_DAYS, boardRefreshPath, buildShotIndex, initialLoadedFrom, isShotDateLoaded, loadedRangeOrFilter,
  mergeShotRange, nextChunk, parseShotRangeQuery, parseSinceQuery, resolveLoadedFrom, shotRangePath,
} from './shotWindow.ts'
import type { CompetitorBoard, CompetitorShot, CompetitorWithHistory } from './types.ts'

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

test('parseShotRangeQuery: before 本身非法时拒绝（字符串上仍晚于 from，靠校验而不是顺序挡住）', () => {
  assert.deepEqual(parseShotRangeQuery('2026-08-01', '2026-09-31'), { ok: false })
  assert.deepEqual(parseShotRangeQuery('2026-08-01', '2026-08-17,id.gt.0'), { ok: false })
})

test('initialLoadedFrom: 按有图日切段而不是按日历天（轴上有空档）', () => {
  const gapped = [
    '2026-07-01', '2026-07-02', '2026-07-10', '2026-07-11', '2026-07-20', '2026-07-21',
    '2026-08-01', '2026-08-02', '2026-08-10', '2026-08-11', '2026-08-20', '2026-08-21',
  ]
  assert.equal(initialLoadedFrom(gapped), '2026-07-10')
})

test('isShotDateLoaded: 全部已加载、轴为空、无日期列一律算已加载', () => {
  assert.equal(isShotDateLoaded('2026-08-01', null), true)
  assert.equal(isShotDateLoaded(null, '2026-08-16'), true)
  assert.equal(isShotDateLoaded(UNDATED_KEY, '2026-08-16'), true)
})

test('isShotDateLoaded: 不早于起点才算已加载', () => {
  assert.equal(isShotDateLoaded('2026-08-16', '2026-08-16'), true)
  assert.equal(isShotDateLoaded('2026-08-20', '2026-08-16'), true)
  assert.equal(isShotDateLoaded('2026-08-15', '2026-08-16'), false)
})

// 轴 08-01…08-25；首屏起点 08-16（下标 15）
const AXIS = axisOf(25)
const win = (firstDay: number) => AXIS.slice(firstDay - 1, firstDay + 4)

test('nextChunk: 全部已加载时不补', () => {
  assert.equal(nextChunk(AXIS, win(1), null), null)
})

test('nextChunk: 当前屏之前还剩整整一屏缓冲时不补', () => {
  // 首屏看 08-21..08-25，起点 08-16：前面正好 5 天缓冲
  assert.equal(nextChunk(AXIS, win(21), '2026-08-16'), null)
})

test('nextChunk: 缓冲不足一屏就补起点之前 10 个有图日', () => {
  // 点一次「更早」→ 看 08-16..08-20，缓冲 0
  assert.deepEqual(nextChunk(AXIS, win(16), '2026-08-16'), { from: '2026-08-06', before: '2026-08-16' })
})

test('nextChunk: 补到轴首为止', () => {
  assert.deepEqual(nextChunk(AXIS, win(6), '2026-08-06'), { from: '2026-08-01', before: '2026-08-06' })
})

test('nextChunk: 窗口一次跳很远时，补的这一段盖住整屏再往前一屏', () => {
  // 窗口 08-03..08-07 整屏落在未加载区，起点还在 08-16
  assert.deepEqual(nextChunk(AXIS, win(3), '2026-08-16'), { from: '2026-08-01', before: '2026-08-16' })
  const axis40 = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10))
  // 起点 08-05（下标 35），窗口从 07-11（下标 10）开始：from 取 10-5=5 → 07-06
  assert.deepEqual(nextChunk(axis40, axis40.slice(10, 15), '2026-08-05'), { from: '2026-07-06', before: '2026-08-05' })
})

test('nextChunk: 起点那天的图被删光、已不在轴上时按轴上下一个日期定位', () => {
  const axis = AXIS.filter((d) => d !== '2026-08-16')
  // 起点 08-16 不在轴上 → 定位到 08-17（新下标 15），窗口 08-17..08-21 缓冲 0
  assert.deepEqual(nextChunk(axis, ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'], '2026-08-16'),
    { from: '2026-08-06', before: '2026-08-16' })
})

test('nextChunk: 轴上已经没有比起点更早的日期时不补', () => {
  const axis = AXIS.slice(15) // 08-16 之前的日期全被删光
  assert.equal(nextChunk(axis, axis.slice(0, 5), '2026-08-16'), null)
})

test('nextChunk: 窗口里只有无日期列时不补', () => {
  assert.equal(nextChunk([...AXIS, UNDATED_KEY], [UNDATED_KEY], '2026-08-16'), null)
  // 起点离轴尾不足一屏时也一样：无日期列不能拿来当"当前屏第一天"去定位
  assert.equal(nextChunk([...AXIS, UNDATED_KEY], [UNDATED_KEY], '2026-08-24'), null)
})

function shotRow(id: string, competitor_id: string, shot_on: string | null, sort_order = 0): CompetitorShot {
  return {
    id, competitor_id, image_url: `https://example.test/${id}.png`, shot_on, tag: null, caption: '',
    sort_order, created_at: '2026-08-01T00:00:00Z', viewer_count: null, stream_started_at: null, captured_at: null,
  }
}

function node(id: string, shots: CompetitorShot[], related: CompetitorWithHistory[] = []): CompetitorWithHistory {
  return {
    id, platform: 'tiktok', handle: id, profile_url: '', display_name: null, note: '',
    created_at: '2026-08-01T00:00:00Z', parent_id: null, avatar_url: null, region: 'JP',
    member_count: null, composition: null, launch_city: null, launched_on: null, mc_note: null,
    online_note: null, latest_videos: null, latest: null, history: [], shots, sessionStarts: [],
    weekly: [], related, descriptions: [], live_sessions: [],
  }
}

function boardOf(competitors: CompetitorWithHistory[], shotsLoadedFrom: string | null): CompetitorBoard {
  return { competitors, canEdit: true, shotAxis: AXIS, shotsLoadedFrom }
}

test('mergeShotRange: 按账号（含子主播）并入，排序与首屏一致，起点推进', () => {
  const board = boardOf([
    node('p', [shotRow('p20', 'p', '2026-08-20')], [node('k', [])]),
  ], '2026-08-16')
  const next = mergeShotRange(board, [
    shotRow('p10', 'p', '2026-08-10'), shotRow('k12', 'k', '2026-08-12'), shotRow('p12', 'p', '2026-08-12'),
  ], { from: '2026-08-06', before: '2026-08-16' })
  assert.equal(next.shotsLoadedFrom, '2026-08-06')
  assert.deepEqual(next.competitors[0].shots.map((s) => s.id), ['p20', 'p12', 'p10'])
  assert.deepEqual(next.competitors[0].related[0].shots.map((s) => s.id), ['k12'])
  // 看板上与截图无关的字段原样带过
  assert.equal(next.canEdit, true)
  assert.deepEqual(next.shotAxis, AXIS)
})

test('mergeShotRange: 补到轴首时起点归一成 null', () => {
  const next = mergeShotRange(boardOf([node('p', [])], '2026-08-06'), [], { from: '2026-08-01', before: '2026-08-06' })
  assert.equal(next.shotsLoadedFrom, null)
})

test('mergeShotRange: 轴上没有有图日时起点也归一成 null', () => {
  const board = { ...boardOf([node('p', [])], '2026-08-16'), shotAxis: [UNDATED_KEY] }
  const next = mergeShotRange(board, [], { from: '2026-08-06', before: '2026-08-16' })
  assert.equal(next.shotsLoadedFrom, null)
})

test('mergeShotRange: 过期结果（起点已不是这段的右端）原样返回', () => {
  const board = boardOf([node('p', [])], '2026-08-11')
  const next = mergeShotRange(board, [shotRow('p10', 'p', '2026-08-10')], { from: '2026-08-06', before: '2026-08-16' })
  assert.equal(next, board)
})

test('mergeShotRange: 区间外的行与找不到账号的行丢弃', () => {
  const next = mergeShotRange(boardOf([node('p', [])], '2026-08-16'), [
    shotRow('in', 'p', '2026-08-10'),
    shotRow('edge', 'p', '2026-08-06'),   // 恰在区间左端，闭区间要收
    shotRow('late', 'p', '2026-08-16'),   // 已加载范围里的，接口不该给；给了也不能重复
    shotRow('early', 'p', '2026-08-05'),
    shotRow('undated', 'p', null),        // 无日期截图首屏已全量带上
    shotRow('ghost', 'deleted', '2026-08-10'),
  ], { from: '2026-08-06', before: '2026-08-16' })
  assert.deepEqual(next.competitors[0].shots.map((s) => s.id), ['in', 'edge'])
})

test('mergeShotRange: 区间内已有的旧行被新行替换，不重复', () => {
  const board = boardOf([node('p', [shotRow('p10', 'p', '2026-08-10')])], '2026-08-16')
  const next = mergeShotRange(board, [{ ...shotRow('p10', 'p', '2026-08-10'), caption: 'new' }],
    { from: '2026-08-06', before: '2026-08-16' })
  assert.deepEqual(next.competitors[0].shots.map((s) => [s.id, s.caption]), [['p10', 'new']])
})

test('mergeShotRange: 区间左端当天的旧行同样被新行替换，不重复', () => {
  const board = boardOf([node('p', [shotRow('p06', 'p', '2026-08-06')])], '2026-08-16')
  const next = mergeShotRange(board, [{ ...shotRow('p06', 'p', '2026-08-06'), caption: 'new' }],
    { from: '2026-08-06', before: '2026-08-16' })
  assert.deepEqual(next.competitors[0].shots.map((s) => [s.id, s.caption]), [['p06', 'new']])
})

test('mergeShotRange: 不修改入参看板', () => {
  const board = boardOf([node('p', [shotRow('p20', 'p', '2026-08-20')])], '2026-08-16')
  mergeShotRange(board, [shotRow('p10', 'p', '2026-08-10')], { from: '2026-08-06', before: '2026-08-16' })
  assert.equal(board.shotsLoadedFrom, '2026-08-16')
  assert.deepEqual(board.competitors[0].shots.map((s) => s.id), ['p20'])
})
