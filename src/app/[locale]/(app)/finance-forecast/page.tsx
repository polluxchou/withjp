export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'
import Header from '@/components/layout/Header'
import FinanceForecastDashboard from '@/components/finance-forecast/FinanceForecastDashboard'
import { createServerClient } from '@/lib/supabase/server'
import {
  calculateMonthlyBudgetCosts,
  type ExpenseForBudget,
} from '@/lib/finance-forecast/calculations'
import { loadFinanceForecastYear } from '@/lib/finance-forecast/service'
import { buildForecastYearMonths } from '@/lib/finance-forecast/year'

export default async function FinanceForecastPage() {
  const t = await getTranslations('financeForecast')
  const db = createServerClient()
  const now = new Date()
  const year = now.getUTCFullYear()
  const selectedMonth = now.getUTCMonth()

  const { data } = await db
    .from('expenses')
    .select('expense_date,period,total_price,payment_status,buyer_name,expense_category')
    .or(`and(expense_date.gte.${year}-01-01,expense_date.lte.${year}-12-31),period.like.${year}-Q%`)

  const baseMonths = buildForecastYearMonths(
    year,
    calculateMonthlyBudgetCosts((data ?? []) as ExpenseForBudget[]),
  )
  const savedForecast = await loadFinanceForecastYear(year, baseMonths)
  if (savedForecast.error) console.error('loadFinanceForecastYear failed:', savedForecast.error)
  const months = savedForecast.data ?? baseMonths

  return (
    <div>
      <Header
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
      />
      <FinanceForecastDashboard initialMonths={months} initialSelectedMonth={selectedMonth} />
    </div>
  )
}
