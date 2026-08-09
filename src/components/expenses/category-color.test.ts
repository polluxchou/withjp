import assert from 'node:assert/strict'
import test from 'node:test'
import { CATEGORY_INDEX, categoryColor } from './category-color.ts'
import { CHART_SERIES } from '../../lib/chart-theme.ts'
import type { ExpenseCategory } from '../../lib/types/index.ts'

const ALL_CATEGORIES = Object.keys(CATEGORY_INDEX) as ExpenseCategory[]

test('CATEGORY_INDEX 覆盖全部 6 个支出类目（与 satisfies 编译期检查互为双保险）', () => {
  assert.equal(ALL_CATEGORIES.length, 6)
})

test('六个类目的索引互不相同', () => {
  const indices = Object.values(CATEGORY_INDEX)
  assert.equal(new Set(indices).size, indices.length)
})

test('categoryColor 对全部类目输出互不重色（同图不撞色，含 tangible_asset/office_supplies 回归）', () => {
  const colors = ALL_CATEGORIES.map((cat) => categoryColor(cat))
  assert.equal(new Set(colors).size, colors.length)
  assert.notEqual(categoryColor('tangible_asset'), categoryColor('office_supplies'))
})

test('categoryColor 输出全部落在 CHART_SERIES 白名单内', () => {
  const series: readonly string[] = CHART_SERIES
  for (const cat of ALL_CATEGORIES) {
    assert.ok(series.includes(categoryColor(cat)), `${cat} 的颜色不在 CHART_SERIES 内`)
  }
})
