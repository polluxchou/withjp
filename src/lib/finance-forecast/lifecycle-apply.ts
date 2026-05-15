// Pure helpers for applying a lifecycle template to the forecast — kept
// in their own module so the unit tests can exercise the year-boundary
// math without pulling in Supabase or React.

import type { ForecastAccountType } from '@/lib/finance-forecast/calculations'

export interface LifecycleApplyCell {
  account_type:           ForecastAccountType
  live_days:              number
  avg_daily_hours:        number
  revenue_per_minute_usd: number
  share_ratio_pct:        number
}

export interface LifecycleApplyTargetRow extends LifecycleApplyCell {
  // Calendar coordinates the row should land on.
  year:       number
  monthIndex: number          // 0..11 within the year (Jan = 0)
  monthKey:   string          // "YYYY-MM"
  rowId:      string          // unique id, namespaced so cross-month copies don't collide
}

/**
 * For each cell in the 12-month template, compute the calendar (year,
 * monthIndex) it should land on when applied starting from the given
 * (startYear, startMonthIndex). Crosses year boundaries naturally — if
 * the start is 2026-06 the last entry lands on 2027-05.
 *
 * Targets outside the dashboard's horizon (years not in `horizonYears`)
 * are dropped. This means an account added at the tail of 2028 only
 * populates the months that fit in the 3-year window.
 */
export function planLifecycleApplication(opts: {
  template:          LifecycleApplyCell[]
  startYear:         number
  startMonthIndex:   number              // 0..11
  horizonYears:      number[]
  accountName:       string
  idSeed:            string              // typically a Date.now() + random suffix per add
}): LifecycleApplyTargetRow[] {
  const horizon = new Set(opts.horizonYears)
  const out: LifecycleApplyTargetRow[] = []
  for (let offset = 0; offset < opts.template.length; offset++) {
    const cell = opts.template[offset]
    const total = opts.startMonthIndex + offset
    const targetYear  = opts.startYear + Math.floor(total / 12)
    const targetMonth = total % 12
    if (!horizon.has(targetYear)) continue
    const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`
    out.push({
      year:                   targetYear,
      monthIndex:             targetMonth,
      monthKey,
      rowId:                  `${monthKey}-lc-${opts.idSeed}-${offset}`,
      account_type:           cell.account_type,
      live_days:              cell.live_days,
      avg_daily_hours:        cell.avg_daily_hours,
      revenue_per_minute_usd: cell.revenue_per_minute_usd,
      share_ratio_pct:        cell.share_ratio_pct,
    })
  }
  return out
}
