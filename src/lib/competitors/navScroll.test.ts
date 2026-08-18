// src/lib/competitors/navScroll.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { RECENTER_MS, centeredScrollLeft, easeOutCubic, scrollLeftAt } from './navScroll.ts'

// 一行 10 个 100px 芯片 = 1000px 内容，可视 400px，可滚区间 [0, 600]。
const ROW = { viewWidth: 400, contentWidth: 1000, chipWidth: 100 }

test('centeredScrollLeft: 内容装得下时不滚', () => {
  assert.equal(
    centeredScrollLeft({ chipStart: 300, chipWidth: 100, viewWidth: 800, contentWidth: 500 }),
    0,
  )
})

test('centeredScrollLeft: 居中可行时把芯片放到正中', () => {
  // 芯片中心 450，可视半宽 200 → 250
  assert.equal(centeredScrollLeft({ ...ROW, chipStart: 400 }), 250)
})

test('centeredScrollLeft: 靠左的芯片夹到 0,不会算出负数', () => {
  assert.equal(centeredScrollLeft({ ...ROW, chipStart: 0 }), 0)
  assert.equal(centeredScrollLeft({ ...ROW, chipStart: 100 }), 0)
})

test('centeredScrollLeft: 靠右的芯片夹到可滚上限', () => {
  assert.equal(centeredScrollLeft({ ...ROW, chipStart: 900 }), 600)
  assert.equal(centeredScrollLeft({ ...ROW, chipStart: 800 }), 600)
})

test('centeredScrollLeft: 刚过夹取边界的芯片开始真居中', () => {
  // chipStart 150 → 中心 200 → target 0，正好落在边界
  assert.equal(centeredScrollLeft({ ...ROW, chipStart: 150 }), 0)
  // 再往右一点就应该开始移动
  assert.equal(centeredScrollLeft({ ...ROW, chipStart: 200 }), 50)
})

test('centeredScrollLeft: 结果取整,不产生亚像素 scrollLeft', () => {
  const v = centeredScrollLeft({ chipStart: 333, chipWidth: 77, viewWidth: 401, contentWidth: 1000 })
  assert.equal(v, Math.round(v))
  assert.equal(v, 171) // 333 + 38.5 - 200.5 = 171
})

test('easeOutCubic: 端点与夹取', () => {
  assert.equal(easeOutCubic(0), 0)
  assert.equal(easeOutCubic(1), 1)
  // 负数与超过 1 都夹回端点,rAF 掉帧导致 elapsed 超时也不会滚过头
  assert.equal(easeOutCubic(-0.5), 0)
  assert.equal(easeOutCubic(2), 1)
})

test('easeOutCubic: 单调递增且减速(前半程走完大部分路程)', () => {
  let prev = -1
  for (let i = 0; i <= 10; i++) {
    const v = easeOutCubic(i / 10)
    assert.ok(v >= prev, `t=${i / 10} 不该回退`)
    prev = v
  }
  assert.ok(easeOutCubic(0.5) > 0.5, 'ease-out 前半程应该走完一半以上')
})

test('scrollLeftAt: 起点与终点精确落位', () => {
  assert.equal(scrollLeftAt(0, 300, 0, RECENTER_MS), 0)
  assert.equal(scrollLeftAt(0, 300, RECENTER_MS, RECENTER_MS), 300)
  // 掉帧导致 elapsed 超时,仍然停在终点而不是冲过去
  assert.equal(scrollLeftAt(0, 300, RECENTER_MS * 3, RECENTER_MS), 300)
})

test('scrollLeftAt: 反向滑动(向左回退)同样收敛', () => {
  assert.equal(scrollLeftAt(300, 0, 0, RECENTER_MS), 300)
  assert.equal(scrollLeftAt(300, 0, RECENTER_MS, RECENTER_MS), 0)
  const mid = scrollLeftAt(300, 0, RECENTER_MS / 2, RECENTER_MS)
  assert.ok(mid < 150 && mid > 0, `中途应已走过半程,实测 ${mid}`)
})

test('scrollLeftAt: duration 为 0 时直接就位,不做除零', () => {
  assert.equal(scrollLeftAt(0, 300, 0, 0), 300)
})

test('scrollLeftAt: 输出取整,不产生亚像素 scrollLeft', () => {
  const v = scrollLeftAt(0, 311, 77, RECENTER_MS)
  assert.equal(v, Math.round(v))
})
