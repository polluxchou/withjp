// 财务预测看板的派生数据：从 FinanceForecastDashboard.tsx 原样抽出,行为不变。
// 值 import 走相对路径带 .ts(node --test 不解析 @/ 别名);纯类型 import 可用别名。
import { FORECAST_ACCOUNT_TYPES } from './calculations.ts'
import type { ForecastAccountType, ForecastMonthResult, ForecastSummary } from '@/lib/finance-forecast/calculations'

export const CHART_TAB_KEYS = ['breakdown', 'cumulative', 'stacked', 'lines', 'indexed'] as const
export type ChartMode = typeof CHART_TAB_KEYS[number]

// 毛利率(%):没有预测收入时记 0。
export function marginPct(profit: number, forecast: number): number {
  return forecast > 0 ? (profit / forecast) * 100 : 0
}

// "YYYY-MM" → 本地化月份名;越界时退回两位月份数字。
export function monthLabelOf(month: string, monthLabels: string[]): string {
  return monthLabels[parseInt(month.slice(5), 10) - 1] ?? month.slice(5)
}

// ── 年度汇总 ────────────────────────────────────────────────────────────────

export interface ForecastAggregate {
  forecast: number
  actual:   number
  budget:   number
  profit:   number
  margin:   number
}

// 整个年份区间的合计。利润 = 预测 - 预算。
export function aggregateYears(years: number[], summaryByYear: Record<number, ForecastSummary>): ForecastAggregate {
  let forecast = 0
  let actual   = 0
  let budget   = 0
  for (const y of years) {
    const s = summaryByYear[y]
    forecast += s.yearly_forecast_usd
    actual   += s.yearly_actual_usd
    budget   += s.yearly_budget_usd
  }
  const profit = forecast - budget
  return {
    forecast,
    actual,
    budget,
    profit,
    margin: marginPct(profit, forecast),
  }
}

export interface MultiYearChartRow {
  year:     string
  forecast: number
  actual:   number
  budget:   number
  profit:   number
}

export function buildMultiYearChartData(years: number[], summaryByYear: Record<number, ForecastSummary>): MultiYearChartRow[] {
  return years.map((y) => {
    const s = summaryByYear[y]
    return {
      year:     String(y),
      forecast: s.yearly_forecast_usd,
      actual:   s.yearly_actual_usd,
      budget:   s.yearly_budget_usd,
      profit:   s.yearly_profit_usd,
    }
  })
}

// 年度卡片上的回本月:按月累计利润(用 profit_usd)首次 ≥ 0 且已有收入的那个月。
// 与月度视图的 findBreakevenIndex 口径不同(那边是累计收入减累计预算),
// 两处各自保留原算法,不合并,免得浮点边界上结论不一致。
export function annualBreakevenMonth(months: ForecastMonthResult[]): string | null {
  let cumProfit = 0
  let cumRevenue = 0
  for (const m of months) {
    cumProfit += m.profit_usd
    cumRevenue += m.forecast_revenue_usd
    if (cumProfit >= 0 && cumRevenue > 0) return m.month
  }
  return null
}

// ── 月度图表数据 ────────────────────────────────────────────────────────────

export function buildBreakdownData(months: ForecastMonthResult[]) {
  return months.map((month) => {
    const revenue = month.forecast_revenue_usd
    const cost    = month.budget_cost_usd
    const profit  = revenue - cost
    return {
      label: month.month.slice(5),
      revenue,
      cost,
      profit,
    }
  })
}

export function buildCumulativeData(months: ForecastMonthResult[]) {
  let runningRevenue = 0
  let runningCost    = 0
  return months.map((month) => {
    runningRevenue += month.forecast_revenue_usd
    runningCost    += month.budget_cost_usd
    return {
      label:        month.month.slice(5),
      cum_revenue:  runningRevenue,
      cum_cost:     runningCost,
      cum_profit:   runningRevenue - runningCost,
    }
  })
}

// 月度视图的回本点:累计利润首次 ≥ 0 且累计收入 > 0 的下标,没有则 -1。
export function findBreakevenIndex(cumulative: { cum_profit: number; cum_revenue: number }[]): number {
  return cumulative.findIndex((row) => row.cum_profit >= 0 && row.cum_revenue > 0)
}

// 堆叠/折线/指数图的数据。indexed 模式下各类型以首个非零月为基数 100。
export function buildChartData(months: ForecastMonthResult[], mode: ChartMode) {
  if (mode !== 'indexed') {
    return months.map((month) => ({
      label:  month.month.slice(5),
      actual: month.actual_revenue_usd,
      budget: month.budget_cost_usd,
      ...month.by_account_type,
    }))
  }

  const bases = Object.fromEntries(
    FORECAST_ACCOUNT_TYPES.map((type) => [
      type,
      months.find((month) => month.by_account_type[type] > 0)?.by_account_type[type] ?? 0,
    ])
  ) as Record<ForecastAccountType, number>

  return months.map((month) => {
    const row: Record<string, number | string> = { label: month.month.slice(5) }
    for (const type of FORECAST_ACCOUNT_TYPES) {
      row[type] = bases[type] > 0 ? (month.by_account_type[type] / bases[type]) * 100 : 0
    }
    return row
  })
}

// ── 全年明细表 ──────────────────────────────────────────────────────────────

// 只列已配置账号的月份(带原下标,点行跳回该月),并给出合计。
export function configuredMonthsSummary(months: ForecastMonthResult[]) {
  const configured = months
    .map((m, index) => ({ ...m, index }))
    .filter((m) => m.rows.length > 0)
  return {
    configured,
    totalForecast: configured.reduce((sum, m) => sum + m.forecast_revenue_usd, 0),
    totalActual:   configured.reduce((sum, m) => sum + m.actual_revenue_usd,   0),
    totalBudget:   configured.reduce((sum, m) => sum + m.budget_cost_usd,      0),
    totalProfit:   configured.reduce((sum, m) => sum + m.profit_usd,           0),
  }
}

export function countConfiguredMonths(months: { rows: unknown[] }[]): number {
  return months.filter((m) => m.rows.length > 0).length
}

// ── 账号收入档 ──────────────────────────────────────────────────────────────

// 收入档 → tone 映射登记在 design-system §1.3 状态枚举表(财务预测账号收入档)。
export type RevenueTier = 'priority' | 'stable' | 'watch'

export function revenueTier(revenue: number): RevenueTier {
  if (revenue >= 8000) return 'priority'
  if (revenue >= 3500) return 'stable'
  return 'watch'
}
