import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateYears,
  annualBreakevenMonth,
  buildBreakdownData,
  buildChartData,
  buildCumulativeData,
  buildMultiYearChartData,
  configuredMonthsSummary,
  countConfiguredMonths,
  findBreakevenIndex,
  marginPct,
  monthLabelOf,
  revenueTier,
} from './dashboard.ts'
import { emptyAccountTypeTotals } from './calculations.ts'
import type { ForecastAccountType, ForecastMonthResult, ForecastSummary } from '@/lib/finance-forecast/calculations'

function month(key: string, revenue: number, budget: number, patch: Partial<ForecastMonthResult> = {}): ForecastMonthResult {
  return {
    month: key,
    rows: [],
    actual_revenue_usd: 0,
    budget_cost_usd: budget,
    forecast_revenue_usd: revenue,
    profit_usd: revenue - budget,
    margin_pct: revenue > 0 ? ((revenue - budget) / revenue) * 100 : null,
    by_account_type: emptyAccountTypeTotals(),
    ...patch,
  }
}

function byType(values: Partial<Record<ForecastAccountType, number>>) {
  return { ...emptyAccountTypeTotals(), ...values }
}

function summary(forecast: number, actual: number, budget: number): ForecastSummary {
  return {
    months: [],
    yearly_forecast_usd: forecast,
    yearly_actual_usd: actual,
    yearly_budget_usd: budget,
    yearly_profit_usd: forecast - budget,
    by_account_type: emptyAccountTypeTotals(),
  }
}

const ROW = { id: 'r', account_name: 'A', account_type: 'key' as const, live_days: 1, avg_daily_hours: 1, revenue_per_minute_usd: 1, share_ratio_pct: 1 }

test('marginPct: 利润 / 预测;没有预测收入记 0', () => {
  assert.equal(marginPct(25, 100), 25)
  assert.equal(marginPct(-50, 100), -50)
  assert.equal(marginPct(10, 0), 0)
  assert.equal(marginPct(10, -5), 0)
})

test('monthLabelOf: 取本地化月份名,越界退回两位数字', () => {
  const labels = ['1月', '2月', '3月']
  assert.equal(monthLabelOf('2026-02', labels), '2月')
  assert.equal(monthLabelOf('2026-12', labels), '12')
})

test('aggregateYears: 合计各年,利润 = 预测 - 预算', () => {
  const byYear = { 2026: summary(1000, 300, 600), 2027: summary(2000, 0, 900), 2028: summary(99, 99, 99) }
  assert.deepEqual(aggregateYears([2026, 2027], byYear), { forecast: 3000, actual: 300, budget: 1500, profit: 1500, margin: 50 })
  assert.deepEqual(aggregateYears([], byYear), { forecast: 0, actual: 0, budget: 0, profit: 0, margin: 0 })
})

test('buildMultiYearChartData: 每年一行,年份转字符串', () => {
  const byYear = { 2026: summary(1000, 300, 600), 2027: summary(2000, 50, 2500) }
  assert.deepEqual(buildMultiYearChartData([2026, 2027], byYear), [
    { year: '2026', forecast: 1000, actual: 300, budget: 600, profit: 400 },
    { year: '2027', forecast: 2000, actual: 50, budget: 2500, profit: -500 },
  ])
})

test('annualBreakevenMonth: 累计利润首次 ≥ 0 且已有收入的月份', () => {
  assert.equal(annualBreakevenMonth([month('2026-01', 0, 100), month('2026-02', 50, 0), month('2026-03', 100, 0)]), '2026-03')
  // 一开始就没成本但也没收入,不算回本
  assert.equal(annualBreakevenMonth([month('2026-01', 0, 0), month('2026-02', 10, 0)]), '2026-02')
  assert.equal(annualBreakevenMonth([month('2026-01', 10, 100)]), null)
  assert.equal(annualBreakevenMonth([]), null)
})

test('annualBreakevenMonth: 用 profit_usd 累计(不是收入减预算)', () => {
  const months = [month('2026-01', 100, 0, { profit_usd: -1 }), month('2026-02', 100, 0, { profit_usd: 1 })]
  assert.equal(annualBreakevenMonth(months), '2026-02')
})

test('buildBreakdownData: 每月收入/成本/利润,标签取月份', () => {
  assert.deepEqual(buildBreakdownData([month('2026-01', 500, 800), month('2026-02', 900, 300)]), [
    { label: '01', revenue: 500, cost: 800, profit: -300 },
    { label: '02', revenue: 900, cost: 300, profit: 600 },
  ])
})

test('buildCumulativeData + findBreakevenIndex: 累计收入减累计预算', () => {
  const data = buildCumulativeData([month('2026-01', 100, 500), month('2026-02', 300, 100), month('2026-03', 400, 100)])
  assert.deepEqual(data, [
    { label: '01', cum_revenue: 100, cum_cost: 500, cum_profit: -400 },
    { label: '02', cum_revenue: 400, cum_cost: 600, cum_profit: -200 },
    { label: '03', cum_revenue: 800, cum_cost: 700, cum_profit: 100 },
  ])
  assert.equal(findBreakevenIndex(data), 2)
  assert.equal(findBreakevenIndex([{ cum_profit: 0, cum_revenue: 0 }, { cum_profit: 0, cum_revenue: 1 }]), 1)
  assert.equal(findBreakevenIndex([{ cum_profit: -1, cum_revenue: 5 }]), -1)
})

test('buildChartData: 非指数模式铺开各类型收入 + 实际/预算', () => {
  const rows = buildChartData([month('2026-01', 0, 40, { actual_revenue_usd: 7, by_account_type: byType({ key: 10, test: 3 }) })], 'stacked')
  assert.deepEqual(rows, [{ label: '01', actual: 7, budget: 40, key: 10, mature: 0, growing: 0, newbie: 0, test: 3, other: 0 }])
  assert.deepEqual(buildChartData([month('2026-01', 0, 0)], 'lines')[0].label, '01')
})

test('buildChartData: 指数模式以各类型首个非零月为 100,没有基数的类型恒 0', () => {
  const months = [
    month('2026-01', 0, 0, { by_account_type: byType({ key: 0, newbie: 50 }) }),
    month('2026-02', 0, 0, { by_account_type: byType({ key: 200, newbie: 25 }) }),
    month('2026-03', 0, 0, { by_account_type: byType({ key: 300, newbie: 100 }) }),
  ]
  const rows = buildChartData(months, 'indexed')
  assert.deepEqual(rows.map((r) => [r.label, r.key, r.newbie, r.mature]), [
    ['01', 0, 100, 0],
    ['02', 100, 50, 0],
    ['03', 150, 200, 0],
  ])
  assert.equal('actual' in rows[0], false)
  // 没有正数基数的类型(哪怕出现负值)一律记 0
  const neg = buildChartData([month('2026-01', 0, 0, { by_account_type: byType({ mature: -5 }) })], 'indexed')
  assert.equal(neg[0].mature, 0)
})

test('configuredMonthsSummary: 只列有账号的月份,带原下标与合计', () => {
  const months = [
    month('2026-01', 100, 40, { rows: [ROW], actual_revenue_usd: 90 }),
    month('2026-02', 999, 999),
    month('2026-03', 300, 500, { rows: [ROW, ROW], actual_revenue_usd: 10 }),
  ]
  const out = configuredMonthsSummary(months)
  assert.deepEqual(out.configured.map((m) => [m.month, m.index]), [['2026-01', 0], ['2026-03', 2]])
  assert.deepEqual([out.totalForecast, out.totalActual, out.totalBudget, out.totalProfit], [400, 100, 540, -140])
})

test('countConfiguredMonths: 有账号行的月份数', () => {
  assert.equal(countConfiguredMonths([{ rows: [ROW] }, { rows: [] }, { rows: [ROW, ROW] }]), 2)
})

test('revenueTier: ≥8000 重点、≥3500 稳定、其余观察', () => {
  assert.equal(revenueTier(8000), 'priority')
  assert.equal(revenueTier(7999.99), 'stable')
  assert.equal(revenueTier(3500), 'stable')
  assert.equal(revenueTier(3499), 'watch')
  assert.equal(revenueTier(0), 'watch')
})
