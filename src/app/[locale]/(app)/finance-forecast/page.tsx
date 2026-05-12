export const dynamic = 'force-dynamic'

import Header from '@/components/layout/Header'
import FinanceForecastDashboard from '@/components/finance-forecast/FinanceForecastDashboard'
import { createServerClient } from '@/lib/supabase/server'
import {
  calculateMonthlyBudgetCosts,
  type ExpenseForBudget,
  type ForecastMonthInput,
} from '@/lib/finance-forecast/calculations'

export default async function FinanceForecastPage() {
  const db = createServerClient()
  const now = new Date()
  const year = now.getUTCFullYear()
  const selectedMonth = now.getUTCMonth()

  const { data } = await db
    .from('expenses')
    .select('expense_date,total_price,payment_status,buyer_name,expense_category')
    .gte('expense_date', `${year}-01-01`)
    .lte('expense_date', `${year}-12-31`)

  const budgetByMonth = calculateMonthlyBudgetCosts((data ?? []) as ExpenseForBudget[])
  const months = buildYearMonths(year, budgetByMonth)

  return (
    <div>
      <Header
        title="财务预测看板"
        subtitle="按直播账号输入月度预测，成本自动同步当前预算，计算开播收益与毛利润结余。"
      />
      <FinanceForecastDashboard initialMonths={months} initialSelectedMonth={selectedMonth} />
    </div>
  )
}

function buildYearMonths(year: number, budgetByMonth: Map<string, number>): ForecastMonthInput[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    return {
      month,
      rows:               [],
      actual_revenue_usd: 0,
      budget_cost_usd:    budgetByMonth.get(month) ?? 0,
      note:               '',
    }
  })
}
