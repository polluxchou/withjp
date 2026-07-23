import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSparklinePoints } from './chart.ts'

test('buildSparklinePoints: 空/单点返回空串', () => {
  assert.equal(buildSparklinePoints([], 100, 20), '')
  assert.equal(buildSparklinePoints([5], 100, 20), '')
})

test('buildSparklinePoints: 首尾 x 贴边，y 归一化（大值在上）', () => {
  const pts = buildSparklinePoints([0, 10], 100, 20).split(' ')
  assert.equal(pts.length, 2)
  const [x0, y0] = pts[0].split(',').map(Number)
  const [x1, y1] = pts[1].split(',').map(Number)
  assert.equal(x0, 0)
  assert.equal(x1, 100)
  assert.equal(y0, 20)
  assert.equal(y1, 0)
})

test('buildSparklinePoints: 全相等时走中线', () => {
  const pts = buildSparklinePoints([7, 7, 7], 100, 20).split(' ')
  assert.equal(pts.length, 3)
  for (const p of pts) assert.equal(Number(p.split(',')[1]), 10)
})
