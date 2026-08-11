// Client-safe lifecycle template model — constants, types, and empty
// builders shared by the editor UI and the server-side persistence in
// lifecycle.ts. Keep this file free of server-only imports (Supabase
// service client 等): it is bundled into 'use client' components, and a
// server-only dependency here breaks their SSR module resolution (the
// component resolves to undefined → whole-page 500).

import type { ForecastAccountType } from '@/lib/finance-forecast/calculations'

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
