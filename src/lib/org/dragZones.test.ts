import assert from 'node:assert/strict'
import test from 'node:test'

import { STATIONARY_TOUCH_PX, centerOnPointer, isStationaryTouchDrop, nextZone, pointerOf } from './dragZones.ts'
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

test('pointerOf: 鼠标取 clientX/Y，触控取第一根手指，键盘没有坐标', () => {
  assert.deepEqual(pointerOf({ clientX: 120, clientY: 45 }), { x: 120, y: 45 })
  assert.deepEqual(pointerOf({ touches: [{ clientX: 30, clientY: 600 }, { clientX: 1, clientY: 1 }] }), { x: 30, y: 600 })
  // touchend 时 touches 已空，退回 changedTouches
  assert.deepEqual(pointerOf({ touches: [], changedTouches: [{ clientX: 31, clientY: 601 }] }), { x: 31, y: 601 })
  // KeyboardEvent 只有 key/code，没有坐标
  assert.equal(pointerOf({ key: ' ', code: 'Space' }), null)
  assert.equal(pointerOf(null), null)
})

test('centerOnPointer: 抓宽行右侧时，覆盖层中心被拉到指针上', () => {
  // 来源行 left 100、宽 600、top 200、高 40：中心 (400, 220)。在 (650, 210) 处按下
  const rect = { left: 100, top: 200, width: 600, height: 40 }
  const pointer = { x: 650, y: 210 }
  // 起拖瞬间 transform 为 0：覆盖层需右移 250、上移 10，中心才落在指针上
  assert.deepEqual(centerOnPointer({ x: 0, y: 0 }, pointer, rect), { x: 250, y: -10 })
  // 之后指针移动了 (-80, 300)：覆盖层中心 = rect 中心 + 结果 = 指针当前位置 (570, 510)
  const moved = centerOnPointer({ x: -80, y: 300 }, pointer, rect)
  assert.deepEqual({ x: 400 + moved.x, y: 220 + moved.y }, { x: 570, y: 510 })
})

test('centerOnPointer: 没有指针（键盘拖）或还没量到矩形时原样返回，且保留 transform 的其他字段', () => {
  const t = { x: 7, y: 9, scaleX: 1, scaleY: 1 }
  assert.equal(centerOnPointer(t, null, { left: 0, top: 0, width: 10, height: 10 }), t)
  assert.equal(centerOnPointer(t, { x: 1, y: 1 }, null), t)
  assert.deepEqual(centerOnPointer(t, { x: 5, y: 5 }, { left: 0, top: 0, width: 10, height: 10 }), { x: 7, y: 9, scaleX: 1, scaleY: 1 })
})
