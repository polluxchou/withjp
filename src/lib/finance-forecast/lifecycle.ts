import { createServerClient } from '@/lib/supabase/server'
import {
  FORECAST_ACCOUNT_TYPES,
  type ForecastAccountType,
} from '@/lib/finance-forecast/calculations'

// The 5 stages a new account can "start" at. 'other' is intentionally
// excluded — it's a catch-all label, not a meaningful starting point.
export const LIFECYCLE_STARTING_STAGES = ['test', 'newbie', 'growing', 'mature', 'key'] as const
export type LifecycleStartingStage = typeof LIFECYCLE_STARTING_STAGES[number]

export const LIFECYCLE_STARTING_STAGE_LABELS: Record<LifecycleStartingStage, string> = {
  test:    '测试号',
  newbie:  '新账号',
  growing: '成长期',
  mature:  '成熟号',
  key:     '重点号',
}

// Each template covers month offsets 0..11 from the application date.
export const LIFECYCLE_MONTH_COUNT = 12

export interface LifecycleMonthCell {
  month_offset:          number              // 0..11
  account_type:          ForecastAccountType // stage at this month
  live_days:             number
  avg_daily_hours:       number
  revenue_per_minute_usd: number
  share_ratio_pct:       number
}

// One complete template = 12 month cells indexed by month_offset.
export type LifecycleTemplate = LifecycleMonthCell[]

// The user's full set: one template per starting stage.
export type LifecycleTemplateSet = Record<LifecycleStartingStage, LifecycleTemplate>

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

// Builds an empty template — every cell zeroed, account_type matching the
// starting stage. The user fills these in via the editor; the dashboard's
// "add from template" flow falls back to the empty set gracefully.
export function emptyLifecycleTemplate(stage: LifecycleStartingStage): LifecycleTemplate {
  return Array.from({ length: LIFECYCLE_MONTH_COUNT }, (_, i) => ({
    month_offset:          i,
    account_type:          stage,
    live_days:             0,
    avg_daily_hours:       0,
    revenue_per_minute_usd: 0,
    share_ratio_pct:       0,
  }))
}

export function emptyLifecycleSet(): LifecycleTemplateSet {
  return {
    test:    emptyLifecycleTemplate('test'),
    newbie:  emptyLifecycleTemplate('newbie'),
    growing: emptyLifecycleTemplate('growing'),
    mature:  emptyLifecycleTemplate('mature'),
    key:     emptyLifecycleTemplate('key'),
  }
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
