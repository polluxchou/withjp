// src/lib/competitors/weekly.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { weekStartOf, bucketFollowersByWeek } from './weekly.ts'

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
