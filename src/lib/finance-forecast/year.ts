import type { ForecastMonthInput } from '@/lib/finance-forecast/calculations'

export function buildForecastYearMonths(
  year: number,
  budgetByMonth: Map<string, number>,
): ForecastMonthInput[] {
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
