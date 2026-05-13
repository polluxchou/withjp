import type { ForecastMonthInput } from '@/lib/finance-forecast/calculations'

// Number of years included in the forecast horizon (current year + 2 future).
export const FORECAST_HORIZON_YEARS = 3

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

// Returns the year range that the dashboard manages: [current, current+1, current+2].
export function forecastYearRange(anchorYear: number): number[] {
  return Array.from({ length: FORECAST_HORIZON_YEARS }, (_, i) => anchorYear + i)
}

export function buildForecastYearMonthsByYear(
  years: number[],
  budgetByMonth: Map<string, number>,
): Map<number, ForecastMonthInput[]> {
  const out = new Map<number, ForecastMonthInput[]>()
  for (const year of years) {
    out.set(year, buildForecastYearMonths(year, budgetByMonth))
  }
  return out
}
