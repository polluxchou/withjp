import { test } from 'node:test'
import assert from 'node:assert'
import { CHART_SERIES, seriesColor, AXIS, GRID, TOOLTIP_STYLE } from './chart-theme.ts'

test('系列色首位与 UI 主色同值且无重复', () => {
  assert.equal(CHART_SERIES[0], '#7c3aed') // style-tokens-ignore
  assert.equal(new Set(CHART_SERIES).size, CHART_SERIES.length)
})
test('seriesColor 越界循环取色', () => {
  assert.equal(seriesColor(0), CHART_SERIES[0])
  assert.equal(seriesColor(CHART_SERIES.length), CHART_SERIES[0])
})
test('轴/网格用 mauve 灰阶，不再是 slate/zinc', () => {
  assert.equal(AXIS.tick.fill, '#8d87a1') // style-tokens-ignore
  assert.match(GRID.stroke, /rgba\(33, ?28, ?51/)
  assert.equal(TOOLTIP_STYLE.border, '1px solid rgba(33,28,51,0.07)')
})
