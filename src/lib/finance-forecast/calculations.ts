import type { ExpenseCategory, ExpensePaymentStatus } from '../types/index.ts'
import { effectiveCost } from '../expenses/costs.ts'

export type ForecastAccountType = 'key' | 'mature' | 'growing' | 'newbie' | 'test' | 'other'

export interface ForecastAccountInput {
  id:                     string
  account_name:           string
  account_type:           ForecastAccountType
  live_days:              number
  avg_daily_hours:        number
  revenue_per_minute_usd: number
  share_ratio_pct:        number
}

export interface ForecastRowResult extends ForecastAccountInput {
  monthly_revenue_usd: number
}

export interface ForecastMonthInput {
  month:              string
  rows:               ForecastAccountInput[]
  actual_revenue_usd: number
  budget_cost_usd:    number
  note?:              string
}

export interface ForecastMonthResult extends ForecastMonthInput {
  forecast_revenue_usd: number
  profit_usd:           number
  margin_pct:           number
  by_account_type:      Record<ForecastAccountType, number>
}

export interface ForecastSummary {
  months:               ForecastMonthResult[]
  yearly_forecast_usd:  number
  yearly_actual_usd:    number
  yearly_budget_usd:    number
  yearly_profit_usd:    number
  by_account_type:      Record<ForecastAccountType, number>
}

export type ExpenseForBudget = {
  expense_date:     string | null
  total_price:      number | string
  payment_status:   ExpensePaymentStatus
  buyer_name:       string
  expense_category: ExpenseCategory
}

export const FORECAST_ACCOUNT_TYPES: ForecastAccountType[] = [
  'key',
  'mature',
  'growing',
  'newbie',
  'test',
  'other',
]

// Expense records are stored in CNY. Forecast revenue is entered in USD.
// Keep this aligned with src/lib/currency.tsx fixed display rate.
export const CNY_TO_USD_RATE = 1 / 7

export const FORECAST_ACCOUNT_TYPE_LABELS: Record<ForecastAccountType, string> = {
  key:     '重点号',
  mature:  '成熟号',
  growing: '成长期',
  newbie:  '新号',
  test:    '测试号',
  other:   '其他',
}

export function emptyAccountTypeTotals(): Record<ForecastAccountType, number> {
  return Object.fromEntries(
    FORECAST_ACCOUNT_TYPES.map((type) => [type, 0])
  ) as Record<ForecastAccountType, number>
}

export function calculateForecastRows(rows: ForecastAccountInput[]): ForecastRowResult[] {
  return rows.map((row) => ({
    ...row,
    monthly_revenue_usd:
      numeric(row.live_days) *
      numeric(row.avg_daily_hours) *
      60 *
      numeric(row.revenue_per_minute_usd) *
      (numeric(row.share_ratio_pct) / 100),
  }))
}

export function summarizeForecast(months: ForecastMonthInput[]): ForecastSummary {
  const yearlyByType = emptyAccountTypeTotals()
  let yearlyForecast = 0
  let yearlyActual = 0
  let yearlyBudget = 0

  const monthResults = months.map((month) => {
    const byType = emptyAccountTypeTotals()
    for (const row of calculateForecastRows(month.rows)) {
      byType[row.account_type] += row.monthly_revenue_usd
    }

    const forecastRevenue = FORECAST_ACCOUNT_TYPES.reduce((sum, type) => sum + byType[type], 0)
    const profit = forecastRevenue - numeric(month.budget_cost_usd)

    for (const type of FORECAST_ACCOUNT_TYPES) yearlyByType[type] += byType[type]
    yearlyForecast += forecastRevenue
    yearlyActual += numeric(month.actual_revenue_usd)
    yearlyBudget += numeric(month.budget_cost_usd)

    return {
      ...month,
      forecast_revenue_usd: forecastRevenue,
      profit_usd:           profit,
      margin_pct:           forecastRevenue > 0 ? (profit / forecastRevenue) * 100 : 0,
      by_account_type:      byType,
    }
  })

  return {
    months:              monthResults,
    yearly_forecast_usd: yearlyForecast,
    yearly_actual_usd:   yearlyActual,
    yearly_budget_usd:   yearlyBudget,
    yearly_profit_usd:   yearlyForecast - yearlyBudget,
    by_account_type:     yearlyByType,
  }
}

export function calculateMonthlyBudgetCosts(expenses: ExpenseForBudget[]): Map<string, number> {
  const budgets = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.payment_status !== 'budgeted' && expense.payment_status !== 'ordered_unpaid') continue
    if (!expense.expense_date) continue
    const month = expense.expense_date.slice(0, 7)
    budgets.set(month, (budgets.get(month) ?? 0) + effectiveCost(expense) * CNY_TO_USD_RATE)
  }
  return budgets
}

function numeric(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
