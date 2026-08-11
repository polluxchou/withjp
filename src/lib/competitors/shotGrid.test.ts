// src/lib/competitors/shotGrid.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { UNDATED_KEY, isValidShotDate, collectShotDates, windowOf } from './shotGrid.ts'
import type { CompetitorShot, CompetitorWithHistory } from './types.ts'

test('UNDATED_KEY: 无日期占位键', () => {
  assert.equal(UNDATED_KEY, '—')
})

test('isValidShotDate: 合法日期与 null', () => {
  assert.equal(isValidShotDate('2026-08-10'), true)
  assert.equal(isValidShotDate('2026-02-28'), true)
  assert.equal(isValidShotDate(null), true)
  assert.equal(isValidShotDate(undefined), true)
})

test('isValidShotDate: 越界月日', () => {
  assert.equal(isValidShotDate('2026-13-01'), false)
  assert.equal(isValidShotDate('2026-02-30'), false)
  assert.equal(isValidShotDate('2026-00-10'), false)
})

test('isValidShotDate: 格式不合规', () => {
  assert.equal(isValidShotDate('2026-2-3'), false)
  assert.equal(isValidShotDate(''), false)
  assert.equal(isValidShotDate('2026-08-10T00:00:00Z'), false)
})

test('isValidShotDate: 非字符串类型', () => {
  assert.equal(isValidShotDate(20260810), false)
  assert.equal(isValidShotDate({}), false)
})

function shot(id: string, shot_on: string | null): CompetitorShot {
  return {
    id,
    competitor_id: 'c1',
    image_url: `https://example.test/${id}.png`,
    shot_on,
    tag: null,
    caption: '',
    sort_order: 0,
    created_at: '2026-08-01T00:00:00Z',
  }
}

function competitor(
  id: string,
  shots: CompetitorShot[],
  related: CompetitorWithHistory[] = [],
): CompetitorWithHistory {
  return {
    id,
    platform: 'tiktok',
    handle: id,
    profile_url: `https://www.tiktok.com/@${id}`,
    display_name: null,
    note: '',
    created_at: '2026-08-01T00:00:00Z',
    parent_id: null,
    avatar_url: null,
    region: 'JP',
    member_count: null,
    composition: null,
    launch_city: null,
    launched_on: null,
    mc_note: null,
    online_note: null,
    latest_videos: null,
    latest: null,
    history: [],
    shots,
    weekly: [],
    related,
  }
}

test('collectShotDates: 跨竞品去重并升序', () => {
  const axis = collectShotDates([
    competitor('a', [shot('s1', '2026-08-05'), shot('s2', '2026-08-03')]),
    competitor('b', [shot('s3', '2026-08-05'), shot('s4', '2026-08-01')]),
  ])
  assert.deepEqual(axis, ['2026-08-01', '2026-08-03', '2026-08-05'])
})

test('collectShotDates: 递归收集 related 子主播的日期', () => {
  const axis = collectShotDates([
    competitor('parent', [shot('s1', '2026-08-05')], [
      competitor('kid', [shot('s2', '2026-08-02')]),
    ]),
  ])
  assert.deepEqual(axis, ['2026-08-02', '2026-08-05'])
})

test('collectShotDates: 存在无日期图时末尾追加 UNDATED_KEY', () => {
  const axis = collectShotDates([
    competitor('a', [shot('s1', '2026-08-05'), shot('s2', null)]),
  ])
  assert.deepEqual(axis, ['2026-08-05', UNDATED_KEY])
})

test('collectShotDates: 只有无日期图时轴上只有占位键', () => {
  assert.deepEqual(collectShotDates([competitor('a', [shot('s1', null)])]), [UNDATED_KEY])
})

test('collectShotDates: 全空返回空数组', () => {
  assert.deepEqual(collectShotDates([]), [])
  assert.deepEqual(collectShotDates([competitor('a', [])]), [])
})

const AXIS10 = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']

test('windowOf: anchor 居中取 5 列', () => {
  assert.deepEqual(windowOf(AXIS10, 4, 5), ['d2', 'd3', 'd4', 'd5', 'd6'])
})

test('windowOf: 贴左边界仍取满 5 列且含 anchor', () => {
  assert.deepEqual(windowOf(AXIS10, 0, 5), ['d0', 'd1', 'd2', 'd3', 'd4'])
})

test('windowOf: 贴右边界仍取满 5 列且含 anchor', () => {
  assert.deepEqual(windowOf(AXIS10, 9, 5), ['d5', 'd6', 'd7', 'd8', 'd9'])
})

test('windowOf: anchorIndex 为 -1 时按贴右处理', () => {
  assert.deepEqual(windowOf(AXIS10, -1, 5), ['d5', 'd6', 'd7', 'd8', 'd9'])
})

test('windowOf: 轴长度不足 size 时全量返回', () => {
  assert.deepEqual(windowOf(['a', 'b', 'c'], 1, 5), ['a', 'b', 'c'])
})

test('windowOf: 空轴或非正 size 返回空数组', () => {
  assert.deepEqual(windowOf([], 0, 5), [])
  assert.deepEqual(windowOf(AXIS10, 4, 0), [])
})

test('windowOf: 不修改入参', () => {
  const axis = AXIS10.slice()
  windowOf(axis, 4, 5)
  assert.deepEqual(axis, AXIS10)
})
