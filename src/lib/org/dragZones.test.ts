import assert from 'node:assert/strict'
import test from 'node:test'

import { nextZone } from './dragZones.ts'
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
