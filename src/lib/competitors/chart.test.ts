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

// align:'cell' —— 让圆点落在 n 等分格的中心，好和刻度行的等分 grid 逐列对齐。
// 'edge'（默认）保持内缩语义，供无标签的 compact 稀疏图继续使用。

test("buildWeeklyCurve: align 默认为 'edge'，内缩语义不变", () => {
  const rows = [wk('2026-07-14', 1), wk('2026-07-21', 2), wk('2026-07-28', 3), wk('2026-08-04', 4)]
  assert.deepEqual(buildWeeklyCurve(rows, { inset: 8 }).points.map((p) => p.xPct), [8, 36, 64, 92])
  assert.deepEqual(
    buildWeeklyCurve(rows, { inset: 8, align: 'edge' }).points.map((p) => p.xPct),
    [8, 36, 64, 92],
  )
})

test("buildWeeklyCurve: align:'cell' 四点落在四等分格中心", () => {
  const c = buildWeeklyCurve(
    [wk('2026-07-14', 1), wk('2026-07-21', 2), wk('2026-07-28', 3), wk('2026-08-04', 4)],
    { align: 'cell' },
  )
  assert.deepEqual(c.points.map((p) => p.xPct), [12.5, 37.5, 62.5, 87.5])
})

test("buildWeeklyCurve: align:'cell' 对任意点数都取 (2i+1)/2n 的格心", () => {
  for (const n of [2, 3, 4]) {
    const rows = Array.from({ length: n }, (_, i) => wk(`2026-07-${14 + i * 7}`, i + 1))
    const expected = rows.map((_, i) => Math.round((((2 * i + 1) * 100) / (2 * n)) * 100) / 100)
    assert.deepEqual(
      buildWeeklyCurve(rows, { align: 'cell' }).points.map((p) => p.xPct),
      expected,
      `n=${n}`,
    )
  }
})

test("buildWeeklyCurve: align:'cell' 单点仍居中", () => {
  const c = buildWeeklyCurve([wk('2026-07-14', 26600)], { align: 'cell' })
  assert.deepEqual(c.points.map((p) => p.xPct), [50])
})

test("buildWeeklyCurve: align:'cell' 下 inset 失效（格心由点数决定，不受内缩影响）", () => {
  const rows = [wk('2026-07-14', 1), wk('2026-07-21', 2), wk('2026-07-28', 3), wk('2026-08-04', 4)]
  assert.deepEqual(
    buildWeeklyCurve(rows, { align: 'cell', inset: 20 }).points.map((p) => p.xPct),
    buildWeeklyCurve(rows, { align: 'cell' }).points.map((p) => p.xPct),
  )
})

test("buildWeeklyCurve: align:'cell' 只改横向，纵向与 polyline 口径不变", () => {
  const rows = [wk('2026-07-14', 100), wk('2026-07-21', 200), wk('2026-07-28', 300)]
  const edge = buildWeeklyCurve(rows)
  const cell = buildWeeklyCurve(rows, { align: 'cell' })
  assert.deepEqual(cell.points.map((p) => p.yPct), edge.points.map((p) => p.yPct))
  assert.equal(cell.polyline, cell.points.map((p) => `${p.xPct},${p.yPct}`).join(' '))
})
