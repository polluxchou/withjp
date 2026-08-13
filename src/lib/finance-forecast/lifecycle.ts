// Server-side persistence for lifecycle templates. This module imports the
// Supabase service client, so it must only be imported from server code
// (pages, API routes) — client components take the shared model from
// lifecycle-template.ts instead. See server-boundary.test.ts.
import { createServerClient } from '@/lib/supabase/server'
import {
  FORECAST_ACCOUNT_TYPES,
  type ForecastAccountType,
} from '@/lib/finance-forecast/calculations'
import {
  LIFECYCLE_MONTH_COUNT,
  LIFECYCLE_STARTING_STAGES,
  emptyLifecycleSet,
  type LifecycleStartingStage,
  type LifecycleTemplateSet,
} from '@/lib/finance-forecast/lifecycle-template'

// Re-export the client-safe model so existing server-side importers keep
// working with a single import path.
export * from '@/lib/finance-forecast/lifecycle-template'

type ServiceErrorCode = 'invalid_input' | 'db_error'

interface ServiceError {
  code:    ServiceErrorCode
  message: string
}

type ServiceResult<T> =
  | { data: T;    error: null }
  | { data: null; error: ServiceError }

const ok  = <T,>(data: T): ServiceResult<T> => ({ data, error: null })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> =>
  ({ data: null, error: { code, message } })

export function httpStatusForLifecycleError(code: ServiceErrorCode): number {
  if (code === 'invalid_input') return 400
  return 500
}

type TemplateRow = {
  starting_stage:         string
  month_offset:           number
  account_type_at_month:  string
  live_days:              number | string
  avg_daily_hours:        number | string
  revenue_per_minute_usd: number | string
  share_ratio_pct:        number | string
}

export async function loadLifecycleTemplates(userId: string): Promise<ServiceResult<LifecycleTemplateSet>> {
  const db = createServerClient()
  const { data, error } = await db
    .from('finance_forecast_lifecycle_templates')
    .select('starting_stage, month_offset, account_type_at_month, live_days, avg_daily_hours, revenue_per_minute_usd, share_ratio_pct')
    .eq('user_id', userId)

  if (error) return err('db_error', error.message)

  const set = emptyLifecycleSet()
  for (const row of (data ?? []) as TemplateRow[]) {
    if (!isStartingStage(row.starting_stage)) continue
    if (row.month_offset < 0 || row.month_offset > 11) continue
    const cell = set[row.starting_stage][row.month_offset]
    cell.account_type           = isAccountType(row.account_type_at_month) ? row.account_type_at_month : row.starting_stage
    cell.live_days              = numeric(row.live_days)
    cell.avg_daily_hours        = numeric(row.avg_daily_hours)
    cell.revenue_per_minute_usd = numeric(row.revenue_per_minute_usd)
    cell.share_ratio_pct        = numeric(row.share_ratio_pct)
  }
  return ok(set)
}

// Whole-set upsert. We always write all 60 rows (5 stages × 12 months) so
// the persisted state matches the editor's snapshot exactly — no need to
// diff-and-delete because the PK is (user_id, starting_stage, month_offset).
export async function saveLifecycleTemplates(
  userId: string,
  set: LifecycleTemplateSet,
): Promise<ServiceResult<LifecycleTemplateSet>> {
  for (const stage of LIFECYCLE_STARTING_STAGES) {
    const tpl = set[stage]
    if (!Array.isArray(tpl) || tpl.length !== LIFECYCLE_MONTH_COUNT) {
      return err('invalid_input', `Template "${stage}" must have ${LIFECYCLE_MONTH_COUNT} months`)
    }
    for (let i = 0; i < tpl.length; i++) {
      const cell = tpl[i]
      if (cell.month_offset !== i) return err('invalid_input', `Template "${stage}" month_offset mismatch at ${i}`)
      if (!FORECAST_ACCOUNT_TYPES.includes(cell.account_type)) {
        return err('invalid_input', `Invalid account_type at "${stage}".${i}`)
      }
      if (cell.share_ratio_pct < 0 || cell.share_ratio_pct > 100) {
        return err('invalid_input', `share_ratio_pct out of range at "${stage}".${i}`)
      }
      if (cell.live_days < 0 || cell.avg_daily_hours < 0 || cell.revenue_per_minute_usd < 0) {
        return err('invalid_input', `Negative metric at "${stage}".${i}`)
      }
    }
  }

  const rows = LIFECYCLE_STARTING_STAGES.flatMap((stage) =>
    set[stage].map((cell) => ({
      user_id:                userId,
      starting_stage:         stage,
      month_offset:           cell.month_offset,
      account_type_at_month:  cell.account_type,
      live_days:              numeric(cell.live_days),
      avg_daily_hours:        numeric(cell.avg_daily_hours),
      revenue_per_minute_usd: numeric(cell.revenue_per_minute_usd),
      share_ratio_pct:        numeric(cell.share_ratio_pct),
    }))
  )

  const db = createServerClient()
  const { error } = await db
    .from('finance_forecast_lifecycle_templates')
    .upsert(rows, { onConflict: 'user_id,starting_stage,month_offset' })

  if (error) return err('db_error', error.message)
  return ok(set)
}

function numeric(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isStartingStage(value: string): value is LifecycleStartingStage {
  return (LIFECYCLE_STARTING_STAGES as readonly string[]).includes(value)
}

function isAccountType(value: string): value is ForecastAccountType {
  return (FORECAST_ACCOUNT_TYPES as readonly string[]).includes(value)
}
