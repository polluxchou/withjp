// src/components/expenses/category-color.ts — 支出类别 → 图表色的唯一登记处
// (docs/design-system.md §1.5 CHART_SERIES)。ExpenseCategoryChart 与
// ExpenseSankeyChart 此前各自维护一份逐字重复的 CATEGORY_COLORS 硬编码表，
// 且两表都把 tangible_asset 与 office_supplies 赋成了同一个紫色值——同一
// 张图里两个类目撞色。这里改成固定顺序表 + seriesColor 索引取色：CHART_SERIES
// 恰好 6 色、EXPENSE_CATEGORY 恰好 6 个枚举值，双射后既保证同一类目在不同
// 图表间永远同色，也保证同一张图里 6 个类目互不重色。
import type { ExpenseCategory } from '@/lib/types'
import { seriesColor } from '@/lib/chart-theme'

export const CATEGORY_ORDER: ExpenseCategory[] = [
  'tangible_asset',
  'salary',
  'rent',
  'travel',
  'office_supplies',
  'cloud_services',
]

export function categoryColor(category: ExpenseCategory): string {
  return seriesColor(CATEGORY_ORDER.indexOf(category))
}
