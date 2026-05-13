import { createServerClient } from '@/lib/supabase/server'
import {
  FORECAST_ACCOUNT_TYPES,
  type ForecastAccountInput,
  type ForecastAccountType,
  type ForecastMonthInput,
} from '@/lib/finance-forecast/calculations'

type ServiceErrorCode = 'invalid_input' | 'db_error'

interface ServiceError {
  code:    ServiceErrorCode
  message: string
}

type ServiceResult<T> =
  | { data: T;    error: null;  debug?: Record<string, unknown> }
  | { data: null; error: ServiceError }

const ok = <T,>(data: T, debug?: Record<string, unknown>): ServiceResult<T> => ({ data, error: null, debug })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> =>
  ({ data: null, error: { code, message } })

type MonthRow = {
  year:               number
  month:              string
  actual_revenue_usd: number | string
  note:               string | null
}

type AccountRow = {
  id:                     string
  year:                   number
  month:                  string
  account_name:           string
  account_type:           ForecastAccountType
  live_days:              number | string
  avg_daily_hours:        number | string
  revenue_per_minute_usd: number | string
  share_ratio_pct:        number | string
}

export async function loadFinanceForecastYear(
  year: number,
  baseMonths: ForecastMonthInput[],
): Promise<ServiceResult<ForecastMonthInput[]>> {
  if (!validYear(year)) return err('invalid_input', 'Invalid year')

  const db = createServerClient()
  const [monthsRes, accountsRes] = await Promise.all([
    db.from('finance_forecast_months').select('*').eq('year', year),
    db.from('finance_forecast_accounts').select('*').eq('year', year).order('month', { ascending: true }),
  ])

  if (monthsRes.error) return err('db_error', monthsRes.error.message)
  if (accountsRes.error) return err('db_error', accountsRes.error.message)

  return ok(mergeServerData(baseMonths, monthsRes.data as MonthRow[] | null, accountsRes.data as AccountRow[] | null))
}

// Multi-year load. baseMonthsByYear maps each year to its 12-month skeleton
// (already containing synced budget_cost_usd from expenses). One round-trip
// pulls forecast inputs for the entire range so we don't fan out N queries.
export async function loadFinanceForecastYears(
  years: number[],
  baseMonthsByYear: Map<number, ForecastMonthInput[]>,
): Promise<ServiceResult<Map<number, ForecastMonthInput[]>>> {
  if (years.length === 0) return ok(new Map())
  for (const year of years) {
    if (!validYear(year)) return err('invalid_input', `Invalid year: ${year}`)
  }

  const db = createServerClient()
  const [monthsRes, accountsRes] = await Promise.all([
    db.from('finance_forecast_months').select('*').in('year', years),
    db.from('finance_forecast_accounts').select('*').in('year', years).order('month', { ascending: true }),
  ])

  if (monthsRes.error) return err('db_error', monthsRes.error.message)
  if (accountsRes.error) return err('db_error', accountsRes.error.message)

  const monthsByYear  = groupBy((monthsRes.data ?? []) as MonthRow[],  (row) => row.year)
  const accountsByYear = groupBy((accountsRes.data ?? []) as AccountRow[], (row) => row.year)

  const result = new Map<number, ForecastMonthInput[]>()
  for (const year of years) {
    const base = baseMonthsByYear.get(year) ?? []
    result.set(year, mergeServerData(base, monthsByYear.get(year) ?? null, accountsByYear.get(year) ?? null))
  }
  return ok(result)
}

function mergeServerData(
  baseMonths: ForecastMonthInput[],
  monthRows:  MonthRow[]   | null,
  accountRows: AccountRow[] | null,
): ForecastMonthInput[] {
  const monthMeta = new Map((monthRows ?? []).map((row) => [row.month, row]))
  const accountsByMonth = new Map<string, ForecastAccountInput[]>()
  for (const row of accountRows ?? []) {
    const list = accountsByMonth.get(row.month) ?? []
    list.push(accountFromRow(row))
    accountsByMonth.set(row.month, list)
  }

  return baseMonths.map((base) => {
    const meta = monthMeta.get(base.month)
    return {
      ...base,
      actual_revenue_usd: numeric(meta?.actual_revenue_usd),
      note:               meta?.note ?? '',
      rows:               accountsByMonth.get(base.month) ?? [],
    }
  })
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = out.get(key) ?? []
    list.push(item)
    out.set(key, list)
  }
  return out
}

export async function saveFinanceForecastYear(
  year: number,
  months: ForecastMonthInput[],
): Promise<ServiceResult<ForecastMonthInput[]>> {
  if (!validYear(year)) return err('invalid_input', 'Invalid year')
  const invalidMonth = months.find((month) => !month.month.startsWith(`${year}-`))
  if (invalidMonth) return err('invalid_input', `Month ${invalidMonth.month} does not belong to ${year}`)

  for (const month of months) {
    for (const row of month.rows) {
      if (!FORECAST_ACCOUNT_TYPES.includes(row.account_type)) {
        return err('invalid_input', `Invalid account_type: ${row.account_type}`)
      }
    }
  }

  const db = createServerClient()
  const monthRows = months.map((month) => ({
    year,
    month:              month.month,
    actual_revenue_usd: numeric(month.actual_revenue_usd),
    note:               month.note ?? '',
  }))

  const { error: monthError } = await db
    .from('finance_forecast_months')
    .upsert(monthRows, { onConflict: 'year,month' })

  if (monthError) return err('db_error', monthError.message)

  const accountRows = months.flatMap((month) =>
    month.rows.map((row) => ({
      id:                     row.id,
      year,
      month:                  month.month,
      account_name:           row.account_name,
      account_type:           row.account_type,
      live_days:              numeric(row.live_days),
      avg_daily_hours:        numeric(row.avg_daily_hours),
      revenue_per_minute_usd: numeric(row.revenue_per_minute_usd),
      share_ratio_pct:        numeric(row.share_ratio_pct),
    }))
  )

  // Fetch existing IDs before upserting so we can compute stale rows after
  const { data: existingRows, error: fetchError } = await db
    .from('finance_forecast_accounts')
    .select('id')
    .eq('year', year)

  if (fetchError) return err('db_error', fetchError.message)

  // Upsert first (safe even if subsequent delete fails — data is preserved)
  if (accountRows.length > 0) {
    const { error: upsertError } = await db
      .from('finance_forecast_accounts')
      .upsert(accountRows, { onConflict: 'id' })

    if (upsertError) return err('db_error', upsertError.message)
  }

  // Delete rows that are no longer in the dataset using explicit ID list
  const currentIdSet = new Set(accountRows.map((r) => r.id))
  const staleIds = (existingRows ?? []).map((r) => r.id).filter((id) => !currentIdSet.has(id))
  console.log('[forecast-save] year=%s existing=%d current=%d stale=%d ids=%j',
    year, existingRows?.length ?? 0, accountRows.length, staleIds.length, staleIds)
  if (staleIds.length > 0) {
    const { error: deleteError } = await db
      .from('finance_forecast_accounts')
      .delete()
      .in('id', staleIds)
    if (deleteError) {
      console.error('[forecast-save] delete failed:', deleteError.message)
      return err('db_error', deleteError.message)
    }
    console.log('[forecast-save] deleted %d stale rows', staleIds.length)
  }

  return ok(months, {
    existing: existingRows?.length ?? 0,
    current:  accountRows.length,
    stale:    staleIds.length,
    staleIds,
  })
}

export function httpStatusForFinanceForecastError(code: ServiceErrorCode): number {
  if (code === 'invalid_input') return 400
  return 500
}

function accountFromRow(row: AccountRow): ForecastAccountInput {
  return {
    id:                     row.id,
    account_name:           row.account_name,
    account_type:           row.account_type,
    live_days:              numeric(row.live_days),
    avg_daily_hours:        numeric(row.avg_daily_hours),
    revenue_per_minute_usd: numeric(row.revenue_per_minute_usd),
    share_ratio_pct:        numeric(row.share_ratio_pct),
  }
}

function validYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2020 && year <= 2100
}

function numeric(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
