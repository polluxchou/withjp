import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateForecastRows,
  calculateMonthlyBudgetCosts,
  mergeForecastDraft,
  summarizeForecast,
  type ForecastMonthInput,
} from './calculations.ts'

test('calculateForecastRows uses days, hours, per-minute revenue, and share ratio', () => {
  const rows: ForecastMonthInput['rows'] = [
    {
      id: 'a',
      account_name: 'Account A',
      account_type: 'mature',
      live_days: 20,
      avg_daily_hours: 4,
      revenue_per_minute_usd: 1.5,
      share_ratio_pct: 70,
    },
  ]

  const [result] = calculateForecastRows(rows)

  assert.equal(result.monthly_revenue_usd, 20 * 4 * 60 * 1.5 * 0.7)
})

test('summarizeForecast keeps account type contribution at zero without inputs', () => {
  const summary = summarizeForecast([
    { month: '2026-01', rows: [], actual_revenue_usd: 0, budget_cost_usd: 1200 },
  ])

  assert.equal(summary.yearly_forecast_usd, 0)
  assert.equal(summary.by_account_type.newbie, 0)
  assert.equal(summary.by_account_type.growing, 0)
  assert.equal(summary.by_account_type.mature, 0)
  assert.equal(summary.by_account_type.key, 0)
  assert.equal(summary.yearly_profit_usd, -1200)
})

test('calculateMonthlyBudgetCosts places each cost in the month of its expense_date', () => {
  const budgets = calculateMonthlyBudgetCosts([
    {
      expense_date: '2026-03-10',
      period: '2026-Q1',
      total_price: 1000,
      payment_status: 'budgeted',
      buyer_name: 'with-new',
      expense_category: 'salary',
    },
    {
      expense_date: '2026-03-11',
      period: '2026-Q1',
      total_price: 500,
      payment_status: 'ordered_unpaid',
      buyer_name: 'external',
      expense_category: 'travel',
    },
    {
      expense_date: '2026-03-12',
      period: '2026-Q1',
      total_price: 2000,
      payment_status: 'paid',
      buyer_name: 'with-new',
      expense_category: 'rent',
    },
    {
      expense_date: '2026-03-13',
      period: '2026-Q1',
      total_price: 900,
      payment_status: 'refunded',
      buyer_name: 'with-new',
      expense_category: 'salary',
    },
  ])

  const expectedMarchCost = (1000 + 500 * 1.04 + 2000) / 7
  assert.equal(budgets.get('2026-01') ?? 0, 0)
  assert.equal(budgets.get('2026-02') ?? 0, 0)
  assert.equal(budgets.get('2026-03'), expectedMarchCost)
})

test('calculateMonthlyBudgetCosts uses expense_date even when a period is set', () => {
  // A salary paid in June with period 2026-Q2 must show only in June —
  // not split across Apr/May/Jun (the prior behavior surfaced phantom
  // cost in months that had no actual expense).
  const budgets = calculateMonthlyBudgetCosts([
    {
      expense_date: '2026-06-15',
      period: '2026-Q2',
      total_price: 2100,
      payment_status: 'paid',
      buyer_name: 'with-new',
      expense_category: 'salary',
    },
  ])

  assert.equal(budgets.get('2026-04') ?? 0, 0)
  assert.equal(budgets.get('2026-05') ?? 0, 0)
  assert.equal(budgets.get('2026-06'), 300)
})

test('calculateMonthlyBudgetCosts falls back to the first month of the quarter when no expense_date is set', () => {
  const budgets = calculateMonthlyBudgetCosts([
    {
      expense_date: null,
      period: '2026-Q4',
      total_price: 2100,
      payment_status: 'paid',
      buyer_name: 'with-new',
      expense_category: 'salary',
    },
  ])

  assert.equal(budgets.get('2026-10'), 300)
  assert.equal(budgets.get('2026-11') ?? 0, 0)
  assert.equal(budgets.get('2026-12') ?? 0, 0)
})

test('mergeForecastDraft restores account inputs without overwriting synced budget cost', () => {
  const serverMonths: ForecastMonthInput[] = [
    { month: '2026-12', rows: [], actual_revenue_usd: 0, budget_cost_usd: 999, note: '' },
  ]
  const draft = {
    version: 1 as const,
    months: [
      {
        month: '2026-12',
        actual_revenue_usd: 123,
        note: 'year end',
        rows: [
          {
            id: 'row-1',
            account_name: 'Account A',
            account_type: 'key' as const,
            live_days: 12,
            avg_daily_hours: 3,
            revenue_per_minute_usd: 1.2,
            share_ratio_pct: 70,
          },
        ],
      },
    ],
  }

  const [merged] = mergeForecastDraft(serverMonths, draft)

  assert.equal(merged.month, '2026-12')
  assert.equal(merged.budget_cost_usd, 999)
  assert.equal(merged.actual_revenue_usd, 123)
  assert.equal(merged.note, 'year end')
  assert.equal(merged.rows.length, 1)
  assert.equal(merged.rows[0].account_name, 'Account A')
})
