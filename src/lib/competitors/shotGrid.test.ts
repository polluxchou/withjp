// src/lib/competitors/shotGrid.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LIGHTBOX_VISIBLE,
  UNDATED_KEY,
  clampWindowStart,
  collectShotDates,
  groupShotsByDate,
  isValidShotDate,
  missesShotOn,
  resolveAnchor,
  visibleCountFor,
  windowOf,
} from './shotGrid.ts'
import type { CompetitorShot, CompetitorWithHistory } from './types.ts'

test('UNDATED_KEY: 无日期占位键', () => {
  assert.equal(UNDATED_KEY, '—')
})

test('isValidShotDate: 合法日期与 null', () => {
  assert.equal(isValidShotDate('2026-08-10'), true)
  assert.equal(isValidShotDate('2026-02-28'), true)
  assert.equal(isValidShotDate('2024-02-29'), true) // 闰年
  assert.equal(isValidShotDate(null), true)
  assert.equal(isValidShotDate(undefined), true)
})

test('isValidShotDate: 越界月日', () => {
  assert.equal(isValidShotDate('2026-13-01'), false)
  assert.equal(isValidShotDate('2026-02-30'), false)
  assert.equal(isValidShotDate('2026-02-29'), false) // 平年无 2/29
  assert.equal(isValidShotDate('2026-00-10'), false)
})

test('isValidShotDate: 年份超出合理范围', () => {
  // <input type="date"> 手滑很容易打出 0020 这种年份
  assert.equal(isValidShotDate('0000-01-01'), false)
  assert.equal(isValidShotDate('0020-08-10'), false)
  assert.equal(isValidShotDate('3000-01-01'), false)
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
    viewer_count: null,
    stream_started_at: null,
    captured_at: null,
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

test('resolveAnchor: anchor 在轴上时原样返回', () => {
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05'], '2026-08-01'), '2026-08-01')
})

test('resolveAnchor: anchor 为 null 时取最新一天', () => {
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05'], null), '2026-08-05')
})

test('resolveAnchor: anchor 脱轴时取日历距离最近的一天', () => {
  const axis = ['2026-08-01', '2026-08-10', '2026-08-20']
  assert.equal(resolveAnchor(axis, '2026-08-09'), '2026-08-10')
  assert.equal(resolveAnchor(axis, '2026-08-02'), '2026-08-01')
})

test('resolveAnchor: 距离并列时取较新的一天', () => {
  // 08-05 距 08-01 与 08-09 各 4 天
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-09'], '2026-08-05'), '2026-08-09')
})

test('resolveAnchor: UNDATED_KEY 不参与距离计算', () => {
  const axis = ['2026-08-01', UNDATED_KEY]
  assert.equal(resolveAnchor(axis, '2026-08-30'), '2026-08-01')
})

test('resolveAnchor: anchor 本身是 UNDATED_KEY 但已脱轴时取最新一天', () => {
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05'], UNDATED_KEY), '2026-08-05')
})

test('resolveAnchor: 轴尾有 UNDATED_KEY 时默认仍取最新的有日期那天', () => {
  // collectShotDates 把占位键追加在轴尾,不能直接拿 axis 末位当"最新一天"
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05', UNDATED_KEY], null), '2026-08-05')
})

test('resolveAnchor: 轴上只剩 UNDATED_KEY 时返回占位键', () => {
  assert.equal(resolveAnchor([UNDATED_KEY], '2026-08-01'), UNDATED_KEY)
})

test('resolveAnchor: 空轴返回 null', () => {
  assert.equal(resolveAnchor([], '2026-08-01'), null)
  assert.equal(resolveAnchor([], null), null)
})

function shotAt(id: string, shot_on: string | null, sort_order: number, created_at: string): CompetitorShot {
  return { ...shot(id, shot_on), sort_order, created_at }
}

test('groupShotsByDate: 按日期归组', () => {
  const g = groupShotsByDate([
    shot('s1', '2026-08-01'),
    shot('s2', '2026-08-02'),
    shot('s3', '2026-08-01'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['s1', 's3'])
  assert.deepEqual(g.get('2026-08-02')!.map((s) => s.id), ['s2'])
})

test('groupShotsByDate: 组内按 sort_order 升序，首张为封面', () => {
  const g = groupShotsByDate([
    shotAt('b', '2026-08-01', 2, '2026-08-01T00:00:00Z'),
    shotAt('a', '2026-08-01', 1, '2026-08-01T00:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['a', 'b'])
})

test('groupShotsByDate: sort_order 相同时按 created_at 升序', () => {
  const g = groupShotsByDate([
    shotAt('late', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('early', '2026-08-01', 0, '2026-08-01T09:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['early', 'late'])
})

test('groupShotsByDate: shot_on 为空归入 UNDATED_KEY', () => {
  const g = groupShotsByDate([shot('s1', null)])
  assert.deepEqual(g.get(UNDATED_KEY)!.map((s) => s.id), ['s1'])
})

test('groupShotsByDate: 空输入返回空 Map', () => {
  assert.equal(groupShotsByDate([]).size, 0)
})

test('groupShotsByDate: 不修改入参数组的顺序', () => {
  const input = [shotAt('b', '2026-08-01', 2, '2026-08-01T00:00:00Z'), shotAt('a', '2026-08-01', 1, '2026-08-01T00:00:00Z')]
  groupShotsByDate(input)
  assert.deepEqual(input.map((s) => s.id), ['b', 'a'])
})

test('clampWindowStart: 总数不超过窗口时恒为 0', () => {
  // 当天只有 1-3 张时窗口不该滑动,否则会滑出空位
  assert.equal(clampWindowStart(0, 1, 3), 0)
  assert.equal(clampWindowStart(2, 3, 3), 0)
  assert.equal(clampWindowStart(5, 0, 3), 0)
})

test('clampWindowStart: 贴左与贴右', () => {
  assert.equal(clampWindowStart(-1, 5, 3), 0)
  assert.equal(clampWindowStart(9, 5, 3), 2) // total - size
})

test('clampWindowStart: 窗口内原样返回', () => {
  assert.equal(clampWindowStart(1, 5, 3), 1)
  assert.equal(clampWindowStart(2, 5, 3), 2)
})

test('LIGHTBOX_VISIBLE: 灯箱并排张数', () => {
  assert.equal(LIGHTBOX_VISIBLE, 3)
})

test('visibleCountFor: 真实设备尺寸下的并排张数', () => {
  // 竖图由高度约束宽度,单张宽 = 0.36 × vh(64vh 高 × 9:16)。
  // 期望值对应产品决策:手机与竖屏平板走单图,横屏平板与笔记本走三连排。
  assert.equal(visibleCountFor(390, 844, 3), 1)   // iPhone 竖屏
  assert.equal(visibleCountFor(768, 1024, 3), 1)  // iPad 竖屏:宽度够 768 但三连排塞不下
  assert.equal(visibleCountFor(1024, 768, 3), 3)  // iPad 横屏
  assert.equal(visibleCountFor(1280, 800, 3), 3)  // 笔记本
})

test('visibleCountFor: 至少返回 1,且不超过上限', () => {
  // 再窄也要显示一张,否则灯箱变成空的
  assert.equal(visibleCountFor(100, 2000, 3), 1)
  // 再宽也不超过 max
  assert.equal(visibleCountFor(6000, 400, 3), 3)
})

test('visibleCountFor: 中间档位能落到 2 张', () => {
  // 存在既放不下 3 张、又放得下 2 张的视口
  assert.equal(visibleCountFor(800, 700, 3), 2)
})

test('visibleCountFor: 非法视口尺寸兜底为 1', () => {
  // SSR 或尚未测量到尺寸时不要算出 0 张
  assert.equal(visibleCountFor(0, 0, 3), 1)
})

// —— 导航条「当天无截图」标记 ——

const shotOn = (shot_on: string | null) => ({ shot_on })

test('missesShotOn: 当天有图不标记,没图才标记', () => {
  const shots = [shotOn('2026-08-18'), shotOn('2026-08-19')]
  assert.equal(missesShotOn(shots, '2026-08-19'), false)
  assert.equal(missesShotOn(shots, '2026-08-17'), true)
})

test('missesShotOn: 从没截过图的账号一律标记', () => {
  assert.equal(missesShotOn([], '2026-08-19'), true)
  assert.equal(missesShotOn(undefined, '2026-08-19'), true)
})

test('missesShotOn: 未标日期的图不算当天的图', () => {
  assert.equal(missesShotOn([shotOn(null)], '2026-08-19'), true)
})

test('missesShotOn: 轴为空或停在"未标日期"列时不标记', () => {
  // 这两种情况下"当天"没有意义,标出来会让整条导航一片黄
  assert.equal(missesShotOn([], null), false)
  assert.equal(missesShotOn([], UNDATED_KEY), false)
  assert.equal(missesShotOn([shotOn('2026-08-19')], UNDATED_KEY), false)
})
