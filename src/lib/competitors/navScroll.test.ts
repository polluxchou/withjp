// src/lib/competitors/navScroll.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { centeredScrollLeft } from './navScroll.ts'

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
