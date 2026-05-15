import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FORECAST_HORIZON_YEARS,
  buildForecastYearMonths,
  buildForecastYearMonthsByYear,
  forecastYearRange,
} from './year.ts'

test('forecastYearRange returns the anchor year plus the next two', () => {
  assert.deepEqual(forecastYearRange(2026), [2026, 2027, 2028])
  assert.equal(forecastYearRange(2030).length, FORECAST_HORIZON_YEARS)
})

test('buildForecastYearMonths produces 12 months keyed YYYY-MM with budget lookup', () => {
  const budgets = new Map<string, number>([
    ['2026-03', 1500],
    ['2026-12', 999],
  ])
  const months = buildForecastYearMonths(2026, budgets)

  assert.equal(months.length, 12)
  assert.equal(months[0].month,  '2026-01')
  assert.equal(months[11].month, '2026-12')
  assert.equal(months[2].budget_cost_usd, 1500)
  assert.equal(months[11].budget_cost_usd, 999)
  assert.equal(months[0].budget_cost_usd, 0)
})

test('buildForecastYearMonthsByYear keeps each year isolated and sharing the same budget source', () => {
  const budgets = new Map<string, number>([
    ['2026-01', 100],
    ['2027-01', 200],
    ['2028-12', 300],
  ])
  const byYear = buildForecastYearMonthsByYear([2026, 2027, 2028], budgets)

  assert.equal(byYear.size, 3)
  assert.equal(byYear.get(2026)![0].budget_cost_usd, 100)
  assert.equal(byYear.get(2027)![0].budget_cost_usd, 200)
  assert.equal(byYear.get(2028)![11].budget_cost_usd, 300)
  // Years don't bleed: 2026 January has 100 only; 2027 January has 200 only.
  assert.equal(byYear.get(2026)![11].budget_cost_usd, 0)
  assert.equal(byYear.get(2028)![0].budget_cost_usd, 0)
})
