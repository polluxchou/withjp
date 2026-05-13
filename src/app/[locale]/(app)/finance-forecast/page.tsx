export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import FinanceForecastDashboard from '@/components/finance-forecast/FinanceForecastDashboard'
import { createServerClient } from '@/lib/supabase/server'
import {
  calculateMonthlyBudgetCosts,
  type ExpenseForBudget,
  type ForecastMonthInput,
} from '@/lib/finance-forecast/calculations'
import { loadFinanceForecastYears } from '@/lib/finance-forecast/service'
import {
  buildForecastYearMonthsByYear,
  forecastYearRange,
} from '@/lib/finance-forecast/year'

export default async function FinanceForecastPage() {
  const db = createServerClient()
  const now = new Date()
  const anchorYear = now.getUTCFullYear()
  const years = forecastYearRange(anchorYear)
  const startYear = years[0]
  const endYear   = years[years.length - 1]

  const { data } = await db
    .from('expenses')
    .select('expense_date,period,total_price,payment_status,buyer_name,expense_category')
    .or(
      `and(expense_date.gte.${startYear}-01-01,expense_date.lte.${endYear}-12-31),` +
      years.map((y) => `period.like.${y}-Q%`).join(','),
    )

  const budgetByMonth = calculateMonthlyBudgetCosts((data ?? []) as ExpenseForBudget[])
  const baseMonthsByYear = buildForecastYearMonthsByYear(years, budgetByMonth)
  const savedForecast = await loadFinanceForecastYears(years, baseMonthsByYear)
  if (savedForecast.error) console.error('loadFinanceForecastYears failed:', savedForecast.error)

  const monthsByYear: Record<number, ForecastMonthInput[]> = {}
  for (const year of years) {
    monthsByYear[year] = savedForecast.data?.get(year) ?? baseMonthsByYear.get(year) ?? []
  }

  return (
    <div>
      <Header
        title="财务预测看板"
        subtitle="管理当前年和后 2 年的滚动预测；账号参数按月输入，成本自动同步预算。"
      />
      <FinanceForecastDashboard
        monthsByYear={monthsByYear}
        years={years}
        anchorYear={anchorYear}
        initialSelectedMonth={now.getUTCMonth()}
      />
    </div>
  )
}
