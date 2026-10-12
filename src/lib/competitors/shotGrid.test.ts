// src/lib/competitors/shotGrid.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SHOT_DATE_FUTURE_DAYS,
  UNDATED_KEY,
  compareShotsForBoard,
  coverOf,
  groupShotsByDate,
  isValidShotDate,
  missesShotOn,
  resolveAnchor,
  shiftDate,
  windowOf,
} from './shotGrid.ts'
import type { CompetitorShot } from './types.ts'

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
  // 轴尾会追加占位键,不能直接拿 axis 末位当"最新一天"
  assert.equal(resolveAnchor(['2026-08-01', '2026-08-05', UNDATED_KEY], null), '2026-08-05')
})

test('resolveAnchor: 轴上只剩 UNDATED_KEY 时返回占位键', () => {
  assert.equal(resolveAnchor([UNDATED_KEY], '2026-08-01'), UNDATED_KEY)
})

test('resolveAnchor: 空轴返回 null', () => {
  assert.equal(resolveAnchor([], '2026-08-01'), null)
  assert.equal(resolveAnchor([], null), null)
})

function shotAt(
  id: string, shot_on: string | null, sort_order: number, created_at: string, captured_at: string | null = null,
): CompetitorShot {
  return { ...shot(id, shot_on), sort_order, created_at, captured_at }
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

test('groupShotsByDate: 组内按 sort_order 升序', () => {
  const g = groupShotsByDate([
    shotAt('b', '2026-08-01', 2, '2026-08-01T00:00:00Z'),
    shotAt('a', '2026-08-01', 1, '2026-08-01T00:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['a', 'b'])
})

test('groupShotsByDate: 没有截图时刻时按入库时刻升序', () => {
  const g = groupShotsByDate([
    shotAt('late', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('early', '2026-08-01', 0, '2026-08-01T09:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['early', 'late'])
})

test('groupShotsByDate: 人工上传（无 captured_at）按入库时刻排，不被 id 字母序带偏', () => {
  // id 字母序与时间正序相反：只看 captured_at 的实现会把两张都当"读不出"，退到 id 兜底排成 a, z
  const g = groupShotsByDate([
    shotAt('a', '2026-08-01', 0, '2026-08-01T11:00:00Z'),
    shotAt('z', '2026-08-01', 0, '2026-08-01T09:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['z', 'a'])
})

test('groupShotsByDate: sort_order 优先于时刻与 id', () => {
  // sort_order、时刻、id 三者全部相反：删掉 sort_order 这一项就会排成 a, b
  const g = groupShotsByDate([
    shotAt('a', '2026-08-01', 2, '2026-08-01T09:00:00Z'),
    shotAt('b', '2026-08-01', 1, '2026-08-01T11:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['b', 'a'])
  assert.equal(coverOf(g.get('2026-08-01')!)!.id, 'a')
})

test('groupShotsByDate: 截图时刻（captured_at）优先于入库时刻', () => {
  // 自动截图批量补传：入库晚，但截图时刻早
  const g = groupShotsByDate([
    shotAt('batch', '2026-08-01', 0, '2026-08-01T12:00:00Z', '2026-08-01T05:00:00Z'),
    shotAt('manual', '2026-08-01', 0, '2026-08-01T08:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['batch', 'manual'])
})

test('groupShotsByDate: 时刻按数值比，不按字符串（Z 与 +00:00、小数秒混用）', () => {
  // 字符串比较会把 "…10:00:00Z" 排在 "…10:00:00.5+00:00" 之后（'Z' > '.'），实际前者更早
  const g = groupShotsByDate([
    shotAt('later', '2026-08-01', 0, '2026-08-01T10:00:00.5+00:00'),
    shotAt('earlier', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id), ['earlier', 'later'])
})

test('groupShotsByDate: 时刻相同或读不出时按 id 兜底，结果稳定', () => {
  const g = groupShotsByDate([
    shotAt('b', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('a', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
    shotAt('d', '2026-08-01', 0, 'garbage'),
    shotAt('c', '2026-08-01', 0, 'garbage'),
  ])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id).filter((id) => id === 'a' || id === 'b'), ['a', 'b'])
  assert.deepEqual(g.get('2026-08-01')!.map((s) => s.id).filter((id) => id === 'c' || id === 'd'), ['c', 'd'])
})

test('coverOf: 封面是组内最后一张（当天最新），空组为 undefined', () => {
  const g = groupShotsByDate([
    shotAt('first', '2026-08-01', 0, '2026-08-01T09:00:00Z'),
    shotAt('newest', '2026-08-01', 0, '2026-08-01T11:00:00Z'),
    shotAt('middle', '2026-08-01', 0, '2026-08-01T10:00:00Z'),
  ])
  assert.equal(coverOf(g.get('2026-08-01')!)!.id, 'newest')
  assert.equal(coverOf([]), undefined)
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

test('compareShotsForBoard: 有日期的按日期倒序、同日 sort_order 升序，无日期垫底且按 sort_order', () => {
  const list = [
    shotAt('x2', null, 2, '2026-08-01T00:00:00Z'),
    shotAt('x1', null, 1, '2026-08-01T00:00:00Z'),
    shotAt('a', '2026-07-20', 0, '2026-08-01T00:00:00Z'),
    shotAt('c', '2026-07-25', 1, '2026-08-01T00:00:00Z'),
    shotAt('b', '2026-07-25', 0, '2026-08-01T00:00:00Z'),
  ]
  assert.deepEqual(list.slice().sort(compareShotsForBoard).map((s) => s.id), ['b', 'c', 'a', 'x1', 'x2'])
})

test('compareShotsForBoard: 无日期垫底是双向的——(无日期, 有日期) > 0 且 (有日期, 无日期) < 0', () => {
  const dated = shotAt('d', '2026-07-20', 0, '2026-08-01T00:00:00Z')
  const undated = shotAt('u', null, 0, '2026-08-01T00:00:00Z')
  // 数组 sort 只会朝某一个方向调比较函数，只测排序结果会漏掉另一半分支，所以直接断言比较函数
  assert.ok(compareShotsForBoard(undated, dated) > 0)
  assert.ok(compareShotsForBoard(dated, undated) < 0)
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

test('SHOT_DATE_FUTURE_DAYS: 截图日期可以往后选几天', () => {
  assert.equal(SHOT_DATE_FUTURE_DAYS, 3)
})

test('shiftDate: 普通加减', () => {
  assert.equal(shiftDate('2026-09-13', 3), '2026-09-16')
  assert.equal(shiftDate('2026-09-13', 0), '2026-09-13')
  assert.equal(shiftDate('2026-09-13', -3), '2026-09-10')
})

test('shiftDate: 跨月', () => {
  assert.equal(shiftDate('2026-09-29', 3), '2026-10-02')
  assert.equal(shiftDate('2026-10-01', -3), '2026-09-28')
})

test('shiftDate: 跨年', () => {
  assert.equal(shiftDate('2026-12-30', 3), '2027-01-02')
  assert.equal(shiftDate('2027-01-02', -3), '2026-12-30')
})

test('shiftDate: 闰年二月', () => {
  // 2028 是闰年,27 号往后数三天要经过 2 月 29 日才到 3 月 1 日
  assert.equal(shiftDate('2028-02-27', 3), '2028-03-01')
  // 2026 不是闰年,同样的 27 号 +3 会落到 3 月 2 日
  assert.equal(shiftDate('2026-02-27', 3), '2026-03-02')
})

test('shiftDate: 夏令时切换当天也按日历天算,不会差一天', () => {
  // 用本地时区的 Date 做加减会在 DST 那天多/少一小时,再取日期就可能退回前一天。
  // 美西 2026-03-08 是夏令时开始日,成员里有人在加州。
  assert.equal(shiftDate('2026-03-07', 3), '2026-03-10')
  assert.equal(shiftDate('2026-11-01', 1), '2026-11-02')
})

test('shiftDate: 非法输入原样返回,不产出 NaN 日期', () => {
  // 返回 "NaN-NaN-NaN" 会被塞进 input 的 max,整个控件静默失效
  assert.equal(shiftDate('', 3), '')
  assert.equal(shiftDate('not-a-date', 3), 'not-a-date')
  assert.equal(shiftDate('2026-02-30', 3), '2026-02-30')
})
