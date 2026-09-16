// src/lib/competitors/weekly.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { weekStartOf, bucketFollowersByWeek, fillWeekSlots } from './weekly.ts'

test('weekStartOf: 归一化到本周周一（UTC）', () => {
  assert.equal(weekStartOf('2026-07-29'), '2026-07-27') // 周三 → 周一
  assert.equal(weekStartOf('2026-07-27'), '2026-07-27') // 周一 → 自身
  assert.equal(weekStartOf('2026-08-02'), '2026-07-27') // 周日 → 上周一
})

test('weekStartOf: 跨年 ISO 边界', () => {
  assert.equal(weekStartOf('2026-01-01'), '2025-12-29') // 周四 → 上一年周一
})

test('bucketFollowersByWeek: 同周多点取最后一次', () => {
  const pts = bucketFollowersByWeek([
    { captured_on: '2026-07-27', followers: 100 },
    { captured_on: '2026-07-29', followers: 130 },
    { captured_on: '2026-07-28', followers: 120 },
  ])
  assert.deepEqual(pts, [{ week_start: '2026-07-27', followers: 130 }])
})

test('bucketFollowersByWeek: 跨周分桶并按周升序', () => {
  const pts = bucketFollowersByWeek([
    { captured_on: '2026-07-27', followers: 100 }, // W-A
    { captured_on: '2026-08-03', followers: 200 }, // W-B
  ])
  assert.deepEqual(pts, [
    { week_start: '2026-07-27', followers: 100 },
    { week_start: '2026-08-03', followers: 200 },
  ])
})

test('bucketFollowersByWeek: 该周最后一次为空则跳过该周', () => {
  const pts = bucketFollowersByWeek([
    { captured_on: '2026-07-27', followers: 100 },
    { captured_on: '2026-07-29', followers: null },
  ])
  assert.deepEqual(pts, [])
})

test('bucketFollowersByWeek: 空输入返回 []', () => {
  assert.deepEqual(bucketFollowersByWeek([]), [])
})

// fillWeekSlots —— 把「最近 N 个有数据的周」换成「最近 N 个日历周」，让缺采的那一周
// 在图上留出真实缺口，而不是被静默压缩成等距的一段。
const p = (week_start: string, followers: number) => ({ week_start, followers })

test('fillWeekSlots: 空输入返回 []', () => {
  assert.deepEqual(fillWeekSlots([], 4), [])
})

test('fillWeekSlots: 四周连续时原样返回，无 null', () => {
  const got = fillWeekSlots(
    [p('2026-08-10', 1), p('2026-08-17', 2), p('2026-08-24', 3), p('2026-08-31', 4)], 4,
  )
  assert.deepEqual(got, [
    { week_start: '2026-08-10', followers: 1 },
    { week_start: '2026-08-17', followers: 2 },
    { week_start: '2026-08-24', followers: 3 },
    { week_start: '2026-08-31', followers: 4 },
  ])
})

test('fillWeekSlots: 中间缺采的周补成 null，占住自己的位置', () => {
  const got = fillWeekSlots([p('2026-08-10', 1), p('2026-08-24', 3), p('2026-08-31', 4)], 4)
  assert.deepEqual(got.map((s) => [s.week_start, s.followers]), [
    ['2026-08-10', 1], ['2026-08-17', null], ['2026-08-24', 3], ['2026-08-31', 4],
  ])
})

test('fillWeekSlots: 前导空周裁掉（新建档账号不显示幽灵空列）', () => {
  const got = fillWeekSlots([p('2026-08-17', 2), p('2026-08-24', 3), p('2026-08-31', 4)], 4)
  assert.deepEqual(got.map((s) => s.week_start), ['2026-08-17', '2026-08-24', '2026-08-31'])
  assert.ok(got.every((s) => s.followers != null))
})

test('fillWeekSlots: 窗口锚定最新有数据的周，更早的点被丢掉', () => {
  // 7/13、7/20 在最新周(8/31)往前数 4 个日历周(8/10..8/31)之外
  const got = fillWeekSlots(
    [p('2026-07-13', 1), p('2026-07-20', 2), p('2026-08-24', 3), p('2026-08-31', 4)], 4,
  )
  assert.deepEqual(got.map((s) => s.week_start), ['2026-08-24', '2026-08-31'])
})

test('fillWeekSlots: 末位永远非 null（右端由最新数据锚定）', () => {
  for (const input of [
    [p('2026-08-31', 4)],
    [p('2026-08-10', 1), p('2026-08-31', 4)],
    [p('2026-08-10', 1), p('2026-08-17', 2), p('2026-08-24', 3), p('2026-08-31', 4)],
  ]) {
    const got = fillWeekSlots(input, 4)
    assert.notEqual(got[got.length - 1].followers, null)
  }
})

test('fillWeekSlots: 单点返回单 slot', () => {
  assert.deepEqual(fillWeekSlots([p('2026-08-31', 4)], 4), [{ week_start: '2026-08-31', followers: 4 }])
})

test('fillWeekSlots: 周算术跨月跨年正确（UTC，不受本地时区影响）', () => {
  const got = fillWeekSlots([p('2025-12-15', 1), p('2026-01-05', 4)], 4)
  assert.deepEqual(got.map((s) => s.week_start), ['2025-12-15', '2025-12-22', '2025-12-29', '2026-01-05'])
  assert.deepEqual(got.map((s) => s.followers), [1, null, null, 4])
})

test('fillWeekSlots: count 可调', () => {
  const all = [p('2026-08-10', 1), p('2026-08-17', 2), p('2026-08-24', 3), p('2026-08-31', 4)]
  assert.deepEqual(fillWeekSlots(all, 2).map((s) => s.week_start), ['2026-08-24', '2026-08-31'])
})

test('fillWeekSlots: 输入乱序也按周排序（不依赖调用方保证升序）', () => {
  const got = fillWeekSlots([p('2026-08-31', 4), p('2026-08-10', 1), p('2026-08-24', 3)], 4)
  assert.deepEqual(got.map((s) => [s.week_start, s.followers]), [
    ['2026-08-10', 1], ['2026-08-17', null], ['2026-08-24', 3], ['2026-08-31', 4],
  ])
})
