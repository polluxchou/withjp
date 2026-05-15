import assert from 'node:assert/strict'
import test from 'node:test'

import { planLifecycleApplication, type LifecycleApplyCell } from './lifecycle-apply.ts'

function tpl(values: Partial<LifecycleApplyCell>[]): LifecycleApplyCell[] {
  return values.map((v) => ({
    account_type:           v.account_type           ?? 'newbie',
    live_days:              v.live_days              ?? 0,
    avg_daily_hours:        v.avg_daily_hours        ?? 0,
    revenue_per_minute_usd: v.revenue_per_minute_usd ?? 0,
    share_ratio_pct:        v.share_ratio_pct        ?? 0,
  }))
}

test('planLifecycleApplication maps 12 cells starting at January with no year crossing', () => {
  const template = tpl(Array.from({ length: 12 }, () => ({})))
  const rows = planLifecycleApplication({
    template,
    startYear:       2026,
    startMonthIndex: 0,
    horizonYears:    [2026, 2027, 2028],
    accountName:     'Alice',
    idSeed:          'seed1',
  })

  assert.equal(rows.length, 12)
  assert.equal(rows[0].monthKey,  '2026-01')
  assert.equal(rows[11].monthKey, '2026-12')
  assert.equal(rows[0].year, 2026)
  assert.equal(rows[11].year, 2026)
})

test('planLifecycleApplication wraps cleanly across year boundaries', () => {
  // Start in 2026-06; 12 entries span 2026-06 .. 2027-05.
  const template = tpl(Array.from({ length: 12 }, () => ({})))
  const rows = planLifecycleApplication({
    template,
    startYear:       2026,
    startMonthIndex: 5,
    horizonYears:    [2026, 2027, 2028],
    accountName:     'Bob',
    idSeed:          'seed2',
  })

  assert.equal(rows[0].monthKey,  '2026-06')
  assert.equal(rows[6].monthKey,  '2026-12')
  assert.equal(rows[7].monthKey,  '2027-01')
  assert.equal(rows[11].monthKey, '2027-05')
})

test('planLifecycleApplication drops months that fall outside the horizon', () => {
  // Start at 2028-12 with 3-year window [2026,2027,2028].
  // Only month 0 (2028-12) is in horizon; months 1..11 fall in 2029+.
  const template = tpl(Array.from({ length: 12 }, () => ({})))
  const rows = planLifecycleApplication({
    template,
    startYear:       2028,
    startMonthIndex: 11,
    horizonYears:    [2026, 2027, 2028],
    accountName:     'Late',
    idSeed:          'seed3',
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].monthKey, '2028-12')
})

test('planLifecycleApplication preserves per-cell account_type and metrics', () => {
  const template = tpl([
    { account_type: 'test',    live_days: 5,  avg_daily_hours: 2, revenue_per_minute_usd: 0.5, share_ratio_pct: 70 },
    { account_type: 'newbie',  live_days: 10, avg_daily_hours: 3, revenue_per_minute_usd: 0.8, share_ratio_pct: 70 },
    { account_type: 'growing', live_days: 20, avg_daily_hours: 4, revenue_per_minute_usd: 1.2, share_ratio_pct: 70 },
    ...Array.from({ length: 9 }, () => ({})),
  ])
  const rows = planLifecycleApplication({
    template,
    startYear:       2026,
    startMonthIndex: 0,
    horizonYears:    [2026, 2027, 2028],
    accountName:     'Carol',
    idSeed:          'seed4',
  })

  assert.equal(rows[0].account_type, 'test')
  assert.equal(rows[0].live_days, 5)
  assert.equal(rows[1].account_type, 'newbie')
  assert.equal(rows[2].account_type, 'growing')
  assert.equal(rows[2].revenue_per_minute_usd, 1.2)
})

test('planLifecycleApplication generates unique row ids per cell', () => {
  const template = tpl(Array.from({ length: 12 }, () => ({})))
  const rows = planLifecycleApplication({
    template,
    startYear:       2026,
    startMonthIndex: 0,
    horizonYears:    [2026, 2027, 2028],
    accountName:     'Dora',
    idSeed:          'unique-seed',
  })

  const ids = new Set(rows.map((r) => r.rowId))
  assert.equal(ids.size, rows.length)
  // Each id is namespaced by month + seed so cross-account collisions are
  // exceedingly unlikely.
  assert.ok(rows[0].rowId.includes('unique-seed'))
})
