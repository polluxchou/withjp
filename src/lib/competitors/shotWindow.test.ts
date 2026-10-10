// src/lib/competitors/shotWindow.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNDATED_KEY } from './shotGrid.ts'
import { buildShotIndex } from './shotWindow.ts'

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
