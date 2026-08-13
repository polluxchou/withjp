import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWeeklyCurve } from './chart.ts'

const wk =(week_start: string, followers: number) => ({ week_start, followers })

test('buildWeeklyCurve: 空输入返回空点集与空折线', () => {
  const c = buildWeeklyCurve([])
  assert.deepEqual(c.points, [])
  assert.equal(c.polyline, '')
})

test('buildWeeklyCurve: 单点居中，不画折线', () => {
  const c = buildWeeklyCurve([wk('2026-07-14', 26600)])
  assert.equal(c.points.length, 1)
  assert.equal(c.points[0].xPct, 50)
  assert.equal(c.points[0].yPct, 50)
  assert.equal(c.polyline, '')
})

test('buildWeeklyCurve: x 按内缩均分，首尾不贴边（避免圆点/标签被裁）', () => {
  const c = buildWeeklyCurve(
    [wk('2026-07-14', 1), wk('2026-07-21', 2), wk('2026-07-28', 3), wk('2026-08-04', 4)],
    { inset: 8 },
  )
  assert.deepEqual(c.points.map((p) => p.xPct), [8, 36, 64, 92])
})

test('buildWeeklyCurve: 最小量程让 +1.1% 只占约两成高度，而非顶到天花板', () => {
  // 真实数据：26.6K 走平三周后升到 26.9K。min-max 拉伸会画成地板到天花板的悬崖。
  const c = buildWeeklyCurve([
    wk('2026-07-14', 26600), wk('2026-07-21', 26600),
    wk('2026-07-28', 26600), wk('2026-08-04', 26900),
  ])
  const flat = c.points[0].yPct
  const peak = c.points[3].yPct
  // 对称于中线，且落差远小于满高
  assert.equal(flat, 61.15)
  assert.equal(peak, 38.85)
  assert.ok(flat - peak < 25, `落差 ${flat - peak} 应远小于满高`)
  // 且没有任何点被钉在边界上
  for (const p of c.points) assert.ok(p.yPct > 5 && p.yPct < 95)
})

test('buildWeeklyCurve: 四周全等时走中线，不凭空造斜坡', () => {
  const c = buildWeeklyCurve([
    wk('2026-07-14', 7), wk('2026-07-21', 7), wk('2026-07-28', 7), wk('2026-08-04', 7),
  ])
  for (const p of c.points) assert.equal(p.yPct, 50)
})

test('buildWeeklyCurve: 全为 0 时不除零', () => {
  const c = buildWeeklyCurve([wk('2026-07-14', 0), wk('2026-07-21', 0)])
  for (const p of c.points) assert.equal(p.yPct, 50)
})

test('buildWeeklyCurve: 大幅波动时上下各留 25% 白', () => {
  const c = buildWeeklyCurve([wk('2026-07-14', 100), wk('2026-07-21', 200)])
  assert.equal(c.points[0].yPct, 83.33)
  assert.equal(c.points[1].yPct, 16.67)
})

test('buildWeeklyCurve: 值越大 yPct 越小（大值在上）', () => {
  const c = buildWeeklyCurve([wk('2026-07-14', 10), wk('2026-07-21', 90)])
  assert.ok(c.points[1].yPct < c.points[0].yPct)
})

test('buildWeeklyCurve: 刻度取 M/D，直接切字符串不经 Date（否则时区会推错一天）', () => {
  const c = buildWeeklyCurve([
    wk('2026-07-14', 1), wk('2026-08-01', 2), wk('2026-12-31', 3), wk('2026-01-05', 4),
  ])
  assert.deepEqual(c.points.map((p) => p.tick), ['7/14', '8/1', '12/31', '1/5'])
})

test('buildWeeklyCurve: 非法日期串原样透出，不产出 NaN/undefined', () => {
  const c = buildWeeklyCurve([wk('', 1), wk('2026-7-4', 2), wk('not-a-date', 3)])
  assert.deepEqual(c.points.map((p) => p.tick), ['', '2026-7-4', 'not-a-date'])
})

test('buildWeeklyCurve: 过滤非有限粉丝数', () => {
  const c = buildWeeklyCurve([
    wk('2026-07-14', 100), wk('2026-07-21', Number.NaN),
    wk('2026-07-28', Number.POSITIVE_INFINITY), wk('2026-08-04', 200),
  ])
  assert.deepEqual(c.points.map((p) => p.week_start), ['2026-07-14', '2026-08-04'])
})

test('buildWeeklyCurve: polyline 与点集同坐标，保证圆点/刻度与折线对齐', () => {
  const c = buildWeeklyCurve([wk('2026-07-14', 100), wk('2026-07-21', 200)])
  assert.equal(c.polyline, c.points.map((p) => `${p.xPct},${p.yPct}`).join(' '))
})
