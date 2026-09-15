import assert from 'node:assert/strict'
import test from 'node:test'

import { autoChainBandDepth, planDimensionChain } from './dimensionChain.ts'
import type { VenueItem, VenueItemType } from './layoutData.ts'

function item(o: {
  id: string
  x: number
  y: number
  width: number
  height: number
  type?: VenueItemType
  rotation?: number
}): VenueItem {
  return {
    id: o.id,
    type: o.type ?? 'area',
    name: o.id,
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    rotation: o.rotation ?? 0,
    status: 'planned',
    note: '',
    height3d: 0,
    elevation: 0,
    thickness: 0,
    placement: 'ground',
  }
}

// 只比 start/end/itemId,length 另外单独断言,避免浮点噪声写进期望值
const strip = (segments: { start: number; end: number; itemId: string | null }[]) =>
  segments.map(({ start, end, itemId }) => ({ start, end, itemId }))

test('planDimensionChain: 单个组件出一段,长度等于组件宽', () => {
  const plan = planDimensionChain([item({ id: 'a', x: 100, y: 200, width: 500, height: 300 })], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 100, end: 600, itemId: 'a' }])
  assert.equal(plan.segments[0].length, 500)
  assert.equal(plan.anchor, 200)
})

test('planDimensionChain: 两个相邻组件出两段,中间没有空隙段', () => {
  const plan = planDimensionChain([
    item({ id: 'a', x: 0, y: 0, width: 400, height: 400 }),
    item({ id: 'b', x: 400, y: 0, width: 300, height: 400 }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'a' },
    { start: 400, end: 700, itemId: 'b' },
  ])
})

test('planDimensionChain: 两个组件之间留空,中间出空隙段', () => {
  const plan = planDimensionChain([
    item({ id: 'a', x: 0, y: 0, width: 400, height: 400 }),
    item({ id: 'b', x: 450, y: 0, width: 300, height: 400 }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'a' },
    { start: 400, end: 450, itemId: null },
    { start: 450, end: 750, itemId: 'b' },
  ])
})

test('planDimensionChain: 带内嵌套组件切开外层空间,三段之和等于跨度', () => {
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'pillar', x: 400, y: 20, width: 70, height: 70, type: 'corridor' }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'hall' },
    { start: 400, end: 470, itemId: 'pillar' },
    { start: 470, end: 1000, itemId: 'hall' },
  ])
  const total = plan.segments.reduce((sum, s) => sum + s.length, 0)
  assert.equal(total, 1000)
})

test('planDimensionChain: 贴边带之外的深处组件不参与分段', () => {
  // 纵向跨度 1000 → 带深 = clamp(100, 60, 200) = 100;楼梯 y=600 落在带外
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'stairs', x: 400, y: 600, width: 200, height: 150, type: 'corridor' }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 0, end: 1000, itemId: 'hall' }])
})

test('planDimensionChain: 标识类组件被排除', () => {
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'door', x: 400, y: 10, width: 70, height: 20, type: 'door_sliding' }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 0, end: 1000, itemId: 'hall' }])
})

test('planDimensionChain: 旋转组件按外接矩形参与', () => {
  // 100×100 转 45° → 外接正方形边长 100·(cos45+sin45) ≈ 141.42,中心不变
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'spun', x: 450, y: 10, width: 100, height: 100, rotation: 45, type: 'equipment' }),
  ], 'horizontal')
  const spun = plan.segments.find((s) => s.itemId === 'spun')
  assert.ok(spun, '旋转组件应当占到一段')
  assert.ok(Math.abs(spun.length - 141.42) < 0.1, `外接矩形宽应≈141.42,实得 ${spun.length}`)
})

test('planDimensionChain: vertical 轴上同样成立', () => {
  const plan = planDimensionChain([
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    item({ id: 'office', x: 20, y: 400, width: 70, height: 70, type: 'corridor' }),
  ], 'vertical')
  assert.deepEqual(strip(plan.segments), [
    { start: 0, end: 400, itemId: 'hall' },
    { start: 400, end: 470, itemId: 'office' },
    { start: 470, end: 1000, itemId: 'hall' },
  ])
  assert.equal(plan.anchor, 0)
})

test('planDimensionChain: 面积相同的重叠组件,owner 取 id 小的那个', () => {
  const plan = planDimensionChain([
    item({ id: 'zz', x: 0, y: 0, width: 200, height: 200 }),
    item({ id: 'aa', x: 0, y: 0, width: 200, height: 200 }),
  ], 'horizontal')
  assert.deepEqual(strip(plan.segments), [{ start: 0, end: 200, itemId: 'aa' }])
})

test('planDimensionChain: 没有可量组件时返回空链', () => {
  const plan = planDimensionChain([item({ id: 'door', x: 0, y: 0, width: 70, height: 20, type: 'door_inward' })], 'horizontal')
  assert.deepEqual(plan.segments, [])
})

test('autoChainBandDepth: 取总跨度 10%,并夹在 0.6m–2.0m', () => {
  const tall = [item({ id: 'a', x: 0, y: 0, width: 100, height: 1000 })]
  assert.equal(autoChainBandDepth(tall, 'horizontal'), 100)
  // 跨度 300 → 30,夹到下限 60
  const short = [item({ id: 'a', x: 0, y: 0, width: 100, height: 300 })]
  assert.equal(autoChainBandDepth(short, 'horizontal'), 60)
  // 跨度 5000 → 500,夹到上限 200
  const huge = [item({ id: 'a', x: 0, y: 0, width: 100, height: 5000 })]
  assert.equal(autoChainBandDepth(huge, 'horizontal'), 200)
})

test('planDimensionChain: 传入带深覆盖自动值', () => {
  const items = [
    item({ id: 'hall', x: 0, y: 0, width: 1000, height: 1000 }),
    // 自动带深 100,这个组件在 140 处,自动模式下落选
    item({ id: 'annex', x: 1000, y: 140, width: 500, height: 600, type: 'renovation' }),
  ]
  assert.deepEqual(
    strip(planDimensionChain(items, 'horizontal').segments),
    [{ start: 0, end: 1000, itemId: 'hall' }],
    '自动带深下 annex 应落选',
  )
  assert.deepEqual(
    strip(planDimensionChain(items, 'horizontal', 200).segments),
    [
      { start: 0, end: 1000, itemId: 'hall' },
      { start: 1000, end: 1500, itemId: 'annex' },
    ],
    '带深放到 200 后 annex 应进链',
  )
})
