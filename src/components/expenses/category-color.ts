// src/components/expenses/category-color.ts — 支出类别 → 图表色的唯一登记处
// (docs/design-system.md §1.5)。ExpenseCategoryChart 与 ExpenseSankeyChart
// 此前各自维护一份逐字重复的 CATEGORY_COLORS 硬编码表，且两表都把
// tangible_asset 与 office_supplies 赋成了同一个紫色值——同一张图里两个类目
// 撞色。
//
// CATEGORY_INDEX 用 `satisfies Record<ExpenseCategory, number>`（而非数组 +
// indexOf）：数组写法编译器无法验证是否覆盖全部枚举值，漏登记一个新类目只会
// 在运行时悄悄查到 -1（seriesColor 内部 modulo 后退化成 CHART_SERIES[0]，与
// tangible_asset 撞色，且不报错）。satisfies 让"新增/改名/删除
// ExpenseCategory 却忘记同步这张表"变成编译期错误。
//
// 相对路径 + 显式 .ts 后缀（而非 @/ alias）：本文件要被 category-color.test.ts
// 用 `node --experimental-strip-types` 直接跑，Node 的 ESM 解析不认识
// tsconfig 的 @/ path alias（那是 webpack/Next 专属），必须用相对路径才能在
// node 里 resolve——同一约定见 src/lib/expenses/costs.ts 对 ../types/index.ts
// 的引用。
import type { ExpenseCategory } from '../../lib/types/index.ts'
import { seriesColor } from '../../lib/chart-theme.ts'

export const CATEGORY_INDEX = {
  tangible_asset:  0,
  salary:          1,
  rent:            2,
  travel:          3,
  office_supplies: 4,
  cloud_services:  5,
} satisfies Record<ExpenseCategory, number>

export function categoryColor(category: ExpenseCategory): string {
  return seriesColor(CATEGORY_INDEX[category])
}
