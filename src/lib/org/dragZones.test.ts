import assert from 'node:assert/strict'
import test from 'node:test'

import { STATIONARY_TOUCH_PX, isStationaryTouchDrop, nextZone } from './dragZones.ts'
import type { ZoneRect } from './dragZones.ts'

// 2×2 网格，每格 100×100，间距 100：A 左上、B 右上、C 左下、D 右下
const A: ZoneRect = { id: 'A', left: 0, top: 0, width: 100, height: 100 }
const B: ZoneRect = { id: 'B', left: 200, top: 0, width: 100, height: 100 }
const C: ZoneRect = { id: 'C', left: 0, top: 200, width: 100, height: 100 }
const D: ZoneRect = { id: 'D', left: 200, top: 200, width: 100, height: 100 }
const GRID = [A, B, C, D]
const centerOf = (z: ZoneRect) => ({ x: z.left + z.width / 2, y: z.top + z.height / 2 })

test('nextZone: 四个方向各一例', () => {
  assert.equal(nextZone(GRID, centerOf(A), 'right')?.id, 'B')
  assert.equal(nextZone(GRID, centerOf(A), 'down')?.id, 'C')
  assert.equal(nextZone(GRID, centerOf(D), 'left')?.id, 'C')
  assert.equal(nextZone(GRID, centerOf(D), 'up')?.id, 'B')
})

test('nextZone: 该方向没有区域 → null（当前所在区不算）', () => {
  assert.equal(nextZone(GRID, centerOf(A), 'left'), null)
  assert.equal(nextZone(GRID, centerOf(A), 'up'), null)
})

test('nextZone: 同方向多个候选取最近', () => {
  const far: ZoneRect = { id: 'far', left: 500, top: 0, width: 100, height: 100 }
  assert.equal(nextZone([...GRID, far], centerOf(A), 'right')?.id, 'B')
})

test('nextZone: 偏离主轴的候选被惩罚（主轴距离 + 2 × 副轴距离）', () => {
  // E 在主轴上更近（右移 100）但下偏 150：100 + 300 = 400 > B 的 200 + 0
  const E: ZoneRect = { id: 'E', left: 100, top: 150, width: 100, height: 100 }
  assert.equal(nextZone([A, B, E], centerOf(A), 'right')?.id, 'B')
})

test('nextZone: 被 CSS 隐藏的零尺寸区不参与', () => {
  const hidden: ZoneRect = { id: 'hidden', left: 120, top: 0, width: 0, height: 0 }
  assert.equal(nextZone([A, B, hidden], centerOf(A), 'right')?.id, 'B')
  assert.equal(nextZone([A, hidden], centerOf(A), 'right'), null)
})

test('nextZone: 副轴权重是 2 倍而不是 1 倍（钉住 spec 的打分口径）', () => {
  // 从 A 中心 (50,50) 向右：B 主轴 200、副轴 0 → 200；
  // E 中心 (150,110)：主轴 100、副轴 60 → 2 倍 220、1 倍 160。
  // 2 倍时 B 胜出；若退化成 1 倍，E 会（错误地）胜出。
  const E: ZoneRect = { id: 'E', left: 100, top: 60, width: 100, height: 100 }
  assert.equal(nextZone([A, B, E], centerOf(A), 'right')?.id, 'B')
})

test('isStationaryTouchDrop: 触控长按后手指几乎没动 → 取消；动过阈值或鼠标 → 照常放下', () => {
  assert.equal(STATIONARY_TOUCH_PX, 10)
  assert.equal(isStationaryTouchDrop(true, { x: 0, y: 0 }), true)
  // (6,6) ≈ 8.49 < 10
  assert.equal(isStationaryTouchDrop(true, { x: 6, y: 6 }), true)
  // (8,6) = 10，不小于阈值
  assert.equal(isStationaryTouchDrop(true, { x: 8, y: 6 }), false)
  assert.equal(isStationaryTouchDrop(false, { x: 0, y: 0 }), false)
})
