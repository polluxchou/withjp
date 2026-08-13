import { test } from 'node:test'
import assert from 'node:assert'
import { CHART_SERIES, seriesColor, AXIS, GRID, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, areaFill } from './chart-theme.ts'

test('系列色首位与 UI 主色同值且无重复', () => {
  assert.equal(CHART_SERIES[0], '#7c3aed') // style-tokens-ignore
  assert.equal(new Set(CHART_SERIES).size, CHART_SERIES.length)
})
test('CHART_SERIES 与 design-system §1.5 六色序列完全一致', () => {
  assert.deepEqual(CHART_SERIES, ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8d87a1']) // style-tokens-ignore
})
test('seriesColor 越界循环取色', () => {
  assert.equal(seriesColor(0), CHART_SERIES[0])
  assert.equal(seriesColor(CHART_SERIES.length), CHART_SERIES[0])
})
test('seriesColor 负数/非整数索引安全取模', () => {
  assert.equal(seriesColor(-1), CHART_SERIES[5])
  assert.equal(seriesColor(1.5), CHART_SERIES[1])
})
test('seriesColor 非有限数回退首位', () => {
  assert.equal(seriesColor(NaN), CHART_SERIES[0])
})
test('轴/网格用 mauve 灰阶，不再是 slate/zinc', () => {
  assert.equal(AXIS.tick.fill, '#8d87a1') // style-tokens-ignore
  assert.match(GRID.stroke, /rgba\(33, ?28, ?51/)
  assert.equal(TOOLTIP_STYLE.border, '1px solid rgba(33,28,51,0.07)')
})
test('GRID 只画横向网格线（全站惯例）', () => {
  assert.equal(GRID.vertical, false)
})
test('TOOLTIP_STYLE 关键视觉属性', () => {
  assert.equal(TOOLTIP_STYLE.borderRadius, '10px')
  assert.equal(TOOLTIP_STYLE.boxShadow, '0 4px 12px rgba(33,28,51,0.08), 0 16px 40px -12px rgba(33,28,51,0.18)')
  assert.equal(TOOLTIP_STYLE.color, '#211c33') // style-tokens-ignore
})
test('TOOLTIP_LABEL_STYLE 用于 tooltip 标题加粗', () => {
  assert.equal(TOOLTIP_LABEL_STYLE.fontWeight, 600)
  assert.equal(TOOLTIP_LABEL_STYLE.color, '#211c33') // style-tokens-ignore
})
test('areaFill 工厂按系列色生成独立渐变 id 与 14%→0 透明度', () => {
  const fill = areaFill('x', '#7c3aed') // style-tokens-ignore
  assert.equal(fill.id, 'x')
  assert.equal(fill.from, '#7c3aed24') // style-tokens-ignore
  assert.equal(fill.to, '#7c3aed00') // style-tokens-ignore
})
